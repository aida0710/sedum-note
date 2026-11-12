// メモをファイル（Markdown・HTML・テキスト）に書き出す。ノートブックはフォルダに、添付は attachments フォルダに置き、
// 1 つの zip にまとめる。添付の無いメモ 1 件だけなら、そのファイル 1 つにする。
// 書き出したものは暗号化されない（呼び出す画面が、書き出す前にそのことを確かめる）。

import { zipSync, type Zippable } from "fflate";
import type { LiveNote, LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { withFrontMatter } from "./frontMatter";
import { bodyPlainText } from "../../core/notes/bodyText";
import { bodyToHtml, noteAsHtmlFile } from "./htmlDocument";
import { type BodyExportContext, bodyToMarkdown } from "./markdownDocument";
import { encodeMarkdownPath, relativePath, safeFileName, UniquePaths } from "./markdownFileNames";

const ATTACHMENTS_DIRECTORY = "attachments";
// 添付（写真など）は既に圧縮されていることが多いので、zip では圧縮せずに入れる。
const STORED_WITHOUT_COMPRESSION = { level: 0 } as const;

export type NoteFileFormat = "markdown" | "html" | "text";

type NoteFileWriter = {
  extension: string;
  mimeType: string;
  // テキストには添付を入れられないので、添付のファイルを一緒に書き出さない。
  includesAttachments: boolean;
  fileText: (note: LiveNote, context: BodyExportContext & { language: string }) => string;
};

const NOTE_FILE_WRITERS: Record<NoteFileFormat, NoteFileWriter> = {
  markdown: {
    extension: ".md",
    mimeType: "text/markdown",
    includesAttachments: true,
    fileText: (note, context) => withFrontMatter({ title: note.content.title, created: note.content.createdAt, updated: note.updatedAt }, bodyToMarkdown(note.body, context)),
  },
  html: {
    extension: ".html",
    mimeType: "text/html",
    includesAttachments: true,
    fileText: (note, context) => noteAsHtmlFile({ title: note.content.title, bodyHtml: bodyToHtml(note.body, context), language: context.language }),
  },
  text: {
    extension: ".txt",
    mimeType: "text/plain",
    includesAttachments: false,
    fileText: (note) => `${note.content.title}\n\n${bodyPlainText(note.body)}\n`,
  },
};

export type NoteFileExport = {
  suggestedName: string;
  mimeType: string;
  bytes: Uint8Array;
  noteCount: number;
  // 同期先から取れず、書き出せなかった添付の数。
  missingAttachmentCount: number;
};

type ExportNotesInput = {
  repository: NoteRepository;
  notes: LiveNote[];
  format: NoteFileFormat;
  // 書き出す HTML に書く言語（画面の言語）。
  language: string;
  // タイトルの無いメモのファイル名。
  untitledName: string;
  // zip にするときのファイル名（拡張子なし）。
  archiveName: string;
};

export async function exportNotesAsFiles({ repository, notes, format, language, untitledName, archiveName }: ExportNotesInput): Promise<NoteFileExport> {
  const writer = NOTE_FILE_WRITERS[format];
  const paths = new UniquePaths();
  const notebookDirectories = notebookDirectoryPaths(repository.notebooks());
  const attachmentPaths = new Map<string, string>();
  const files: Zippable = {};
  const textEncoder = new TextEncoder();
  let missingAttachmentCount = 0;

  for (const note of notes) {
    const directory = note.content.notebookIds.map((notebookId) => notebookDirectories.get(notebookId)).find((path) => path !== undefined) ?? "";
    const notePath = paths.claim(directory, safeFileName(note.content.title, untitledName), writer.extension);
    for (const attachment of writer.includesAttachments ? note.content.attachments : []) {
      if (attachmentPaths.has(attachment.id)) {
        continue;
      }
      const { baseName, extension } = splitExtension(safeFileName(attachment.fileName, attachment.id));
      const attachmentPath = paths.claim(ATTACHMENTS_DIRECTORY, baseName, extension);
      attachmentPaths.set(attachment.id, attachmentPath);
      const bytes = await repository.readAttachment(attachment.id).catch(() => null);
      if (bytes === null) {
        missingAttachmentCount += 1;
      } else {
        files[attachmentPath] = [bytes, STORED_WITHOUT_COMPRESSION];
      }
    }
    files[notePath] = textEncoder.encode(writer.fileText(note, {
      language,
      attachmentHref: ({ id }) => encodeMarkdownPath(relativePath(notePath, attachmentPaths.get(id) ?? ATTACHMENTS_DIRECTORY)),
      noteTitle: (noteId) => repository.note(noteId)?.content.title ?? null,
    }));
  }

  const filePaths = Object.keys(files);
  const onlyPath = filePaths.length === 1 ? filePaths[0] : undefined;
  if (onlyPath !== undefined) {
    return { suggestedName: onlyPath, mimeType: writer.mimeType, bytes: files[onlyPath] as Uint8Array, noteCount: notes.length, missingAttachmentCount };
  }
  return { suggestedName: `${archiveName}.zip`, mimeType: "application/zip", bytes: zipSync(files), noteCount: notes.length, missingAttachmentCount };
}

// ノートブックの ID から、フォルダのパス（親から順に「/」でつなぐ）。
function notebookDirectoryPaths(notebooks: LiveNotebook[]): Map<string, string> {
  const byId = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
  const directories = new Map<string, string>();
  for (const notebook of notebooks) {
    const names: string[] = [];
    const visited = new Set<string>();
    // 親をたどる。同期のマージで親子が輪になっていても止まるよう、通った所を覚える。
    for (let current: LiveNotebook | undefined = notebook; current && !visited.has(current.id); current = byId.get(current.content.parentId ?? "")) {
      visited.add(current.id);
      names.unshift(safeFileName(current.content.name, current.id));
    }
    directories.set(notebook.id, names.join("/"));
  }
  return directories;
}

function splitExtension(fileName: string): { baseName: string; extension: string } {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? { baseName: fileName.slice(0, dot), extension: fileName.slice(dot) } : { baseName: fileName, extension: "" };
}

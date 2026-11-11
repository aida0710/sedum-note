// メモを Markdown のファイルに書き出す。ノートブックはフォルダに、添付は attachments フォルダに置き、
// 1 つの zip にまとめる。添付の無いメモ 1 件だけなら、.md のファイル 1 つにする。
// 書き出したものは暗号化されない（呼び出す画面が、書き出す前にそのことを確かめる）。

import { zipSync, type Zippable } from "fflate";
import type { LiveNote, LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { withFrontMatter } from "./frontMatter";
import { bodyToMarkdown } from "./markdownDocument";
import { encodeMarkdownPath, relativePath, safeFileName, UniquePaths } from "./markdownFileNames";

const ATTACHMENTS_DIRECTORY = "attachments";
// 添付（写真など）は既に圧縮されていることが多いので、zip では圧縮せずに入れる。
const STORED_WITHOUT_COMPRESSION = { level: 0 } as const;

export type MarkdownExport = {
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
  // タイトルの無いメモのファイル名。
  untitledName: string;
  // zip にするときのファイル名（拡張子なし）。
  archiveName: string;
};

export async function exportNotesAsMarkdown({ repository, notes, untitledName, archiveName }: ExportNotesInput): Promise<MarkdownExport> {
  const paths = new UniquePaths();
  const notebookDirectories = notebookDirectoryPaths(repository.notebooks());
  const attachmentPaths = new Map<string, string>();
  const files: Zippable = {};
  const textEncoder = new TextEncoder();
  let missingAttachmentCount = 0;

  for (const note of notes) {
    const directory = note.content.notebookIds.map((notebookId) => notebookDirectories.get(notebookId)).find((path) => path !== undefined) ?? "";
    const notePath = paths.claim(directory, safeFileName(note.content.title, untitledName), ".md");
    for (const attachment of note.content.attachments) {
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
    const markdown = bodyToMarkdown(note.body, {
      attachmentHref: ({ id }) => encodeMarkdownPath(relativePath(notePath, attachmentPaths.get(id) ?? ATTACHMENTS_DIRECTORY)),
      noteTitle: (noteId) => repository.note(noteId)?.content.title ?? null,
    });
    files[notePath] = textEncoder.encode(withFrontMatter({ title: note.content.title, created: note.content.createdAt, updated: note.updatedAt }, markdown));
  }

  const filePaths = Object.keys(files);
  const onlyPath = filePaths.length === 1 ? filePaths[0] : undefined;
  if (onlyPath !== undefined) {
    return { suggestedName: onlyPath, mimeType: "text/markdown", bytes: files[onlyPath] as Uint8Array, noteCount: notes.length, missingAttachmentCount };
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

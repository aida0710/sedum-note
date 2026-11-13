// Markdown のファイルをメモとして取り込む。zip は中身を広げて、フォルダをノートブックにする。
// Markdown から相対パスで指している画像とファイルは、一緒に渡されたものがあれば添付にする。

import { unzipSync } from "fflate";
import type { NoteRepository } from "../../core/notes/noteRepository";
import type { ReportProgress } from "../../core/progress/taskProgress";
import { MAX_ATTACHMENT_BYTES } from "../editor/attachFiles";
import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import { formatByteSize } from "../shared/formatByteSize";
import { splitFrontMatter } from "./frontMatter";
import { type ImportedAttachment, writeMarkdownToBody } from "./markdownDocument";
import { resolveRelativePath } from "./markdownFileNames";
import { mimeTypeOfFileName } from "./mimeTypeOfFileName";
import { propertyValueFromText } from "../../core/notes/noteProperties";

// zip を広げた大きさの上限。全部をメモリに載せるので、小さな zip が巨大に広がるものを断る。
const MAX_UNZIPPED_BYTES = 500 * 1024 * 1024;
const MARKDOWN_FILE_PATTERN = /\.(md|markdown)$/i;

export type ImportSourceFile = { path: string; bytes: Uint8Array };

// 選ばれたファイルを、取り込む材料の一覧にする。zip は中のファイルに広げる。
export async function readImportSources(files: File[]): Promise<ImportSourceFile[]> {
  const sources: ImportSourceFile[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (isZip(bytes)) {
      sources.push(...unzipSources(bytes));
    } else {
      sources.push({ path: file.name, bytes });
    }
  }
  return sources;
}

// zip のファイルの先頭の 4 バイト（PK\x03\x04）。名前の拡張子ではなく中身で見分ける。
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

function isZip(bytes: Uint8Array): boolean {
  return ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function unzipSources(zip: Uint8Array): ImportSourceFile[] {
  let unzippedBytes = 0;
  const entries = unzipSync(zip, {
    filter: (entry) => {
      unzippedBytes += entry.originalSize;
      if (unzippedBytes > MAX_UNZIPPED_BYTES) {
        throw new UserFacingError(translate("error.importTooLarge", { limit: formatByteSize(MAX_UNZIPPED_BYTES) }));
      }
      return !isIgnoredPath(entry.name);
    },
  });
  return Object.entries(entries).filter(([path]) => !path.endsWith("/")).map(([path, bytes]) => ({ path, bytes }));
}

// macOS が zip に足す、ファイルの付属情報。
function isIgnoredPath(path: string): boolean {
  return path.startsWith("__MACOSX/") || (path.split("/").pop() ?? "").startsWith("._");
}

// reportProgress には、取り込んだメモの数を 1 件ごとに渡す。
export async function importMarkdownNotes(repository: NoteRepository, sources: ImportSourceFile[], reportProgress?: ReportProgress): Promise<{ noteCount: number }> {
  const markdownSources = sources.filter((source) => MARKDOWN_FILE_PATTERN.test(source.path));
  if (markdownSources.length === 0) {
    throw new UserFacingError(translate("settings.markdownNothingToImport"));
  }
  const importer = new MarkdownNoteImporter(repository, sources);
  // 画面には、取り込み終えてから 1 回だけ知らせる（1 件ごとに知らせると、件数の 2 乗の時間がかかる）。
  await repository.holdChangeNotifications(async () => {
    for (const [index, source] of markdownSources.entries()) {
      reportProgress?.({ done: index, total: markdownSources.length });
      await importer.importNote(source);
    }
    await repository.flush();
  });
  reportProgress?.({ done: markdownSources.length, total: markdownSources.length });
  return { noteCount: markdownSources.length };
}

// 1 件の Markdown をメモにする。同じ取り込みの中で、ノートブックと添付を使い回す。
class MarkdownNoteImporter {
  readonly #repository: NoteRepository;
  readonly #sourcesByPath: Map<string, ImportSourceFile>;
  readonly #storedAttachments = new Map<string, ImportedAttachment>();
  readonly #notebooks: NotebooksByPath;
  readonly #textDecoder = new TextDecoder();

  constructor(repository: NoteRepository, sources: ImportSourceFile[]) {
    this.#repository = repository;
    this.#sourcesByPath = new Map(sources.map((source) => [source.path.toLowerCase(), source]));
    this.#notebooks = new NotebooksByPath(repository);
  }

  async importNote(source: ImportSourceFile): Promise<void> {
    const repository = this.#repository;
    const segments = source.path.split("/");
    const fileName = segments.pop() ?? source.path;
    const { frontMatter, markdown } = splitFrontMatter(this.#textDecoder.decode(source.bytes));
    const notebookId = await this.#notebooks.ensure(segments);
    const note = await repository.createNote({
      title: frontMatter.title ?? fileName.replace(MARKDOWN_FILE_PATTERN, ""),
      notebookIds: notebookId === null ? [] : [notebookId],
    });
    if (notebookId !== null) {
      await importProperties(repository, { noteId: note.id, notebookId, valuesByName: frontMatter.properties ?? {} });
    }
    await writeMarkdownToBody(markdown, note.body, {
      noteExists: (noteId) => repository.note(noteId) !== undefined,
      attachFile: (relative) => this.#attachFile(source, relative),
    });
  }

  async #attachFile(source: ImportSourceFile, relative: string): Promise<ImportedAttachment | null> {
    const path = resolveRelativePath(source.path, relative);
    const attached = path === null ? undefined : this.#sourcesByPath.get(path.toLowerCase());
    if (!attached || MARKDOWN_FILE_PATTERN.test(attached.path) || attached.bytes.length > MAX_ATTACHMENT_BYTES) {
      return null;
    }
    // 複数のメモが同じファイルを指していても、添付は 1 つにする。
    const stored = this.#storedAttachments.get(attached.path) ?? await storeAttachment(this.#repository, attached);
    this.#storedAttachments.set(attached.path, stored);
    return stored;
  }
}

// 先頭の項目に書いてあったプロパティを、メモに付ける。ノートブックに同じ名前のプロパティが無ければ、文字のプロパティとして足す。
async function importProperties(repository: NoteRepository, input: { noteId: string; notebookId: string; valuesByName: Record<string, string | number | boolean> }): Promise<void> {
  for (const [name, writtenValue] of Object.entries(input.valuesByName)) {
    const properties = repository.notebooks().find((notebook) => notebook.id === input.notebookId)?.content.properties ?? [];
    const property = properties.find((candidate) => candidate.name === name)
      ?? await repository.saveNotebookProperty(input.notebookId, { name, type: "text", options: [], order: Math.max(0, ...properties.map((candidate) => candidate.order)) + 1 });
    await repository.setNotePropertyValue(input.noteId, property.id, propertyValueFromText(property.type, String(writtenValue)));
  }
}

async function storeAttachment(repository: NoteRepository, source: ImportSourceFile): Promise<ImportedAttachment> {
  const fileName = source.path.split("/").pop() ?? source.path;
  const mimeType = mimeTypeOfFileName(fileName);
  const reference = await repository.storeAttachment({ bytes: source.bytes, mimeType, fileName });
  return { attachmentId: reference.id, fileName, mimeType, byteLength: source.bytes.length };
}

// フォルダのパスに当たるノートブックを探し、無ければ作る。
class NotebooksByPath {
  readonly #repository: NoteRepository;

  constructor(repository: NoteRepository) {
    this.#repository = repository;
  }

  // 根のファイル（フォルダの中に無いもの）は null。
  async ensure(directorySegments: string[]): Promise<string | null> {
    let parentId: string | null = null;
    for (const name of directorySegments) {
      const existing = this.#repository.notebooks().find((notebook) => notebook.content.name === name && notebook.content.parentId === parentId);
      parentId = (existing ?? await this.#repository.createNotebook(name, parentId)).id;
    }
    return parentId;
  }
}

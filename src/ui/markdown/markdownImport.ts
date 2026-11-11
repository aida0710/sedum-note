// Markdown のファイルをメモとして取り込む。zip は中身を広げて、フォルダをノートブックにする。
// Markdown から相対パスで指している画像とファイルは、一緒に渡されたものがあれば添付にする。

import { unzipSync } from "fflate";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { MAX_ATTACHMENT_BYTES } from "../editor/attachFiles";
import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import { formatByteSize } from "../shared/formatByteSize";
import { splitFrontMatter } from "./frontMatter";
import { type ImportedAttachment, writeMarkdownToBody } from "./markdownDocument";
import { resolveRelativePath } from "./markdownFileNames";
import { mimeTypeOfFileName } from "./mimeTypeOfFileName";

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

export async function importMarkdownNotes(repository: NoteRepository, sources: ImportSourceFile[]): Promise<{ noteCount: number }> {
  const markdownSources = sources.filter((source) => MARKDOWN_FILE_PATTERN.test(source.path));
  if (markdownSources.length === 0) {
    throw new UserFacingError(translate("settings.markdownNothingToImport"));
  }
  const sourcesByPath = new Map(sources.map((source) => [source.path.toLowerCase(), source]));
  const storedAttachments = new Map<string, ImportedAttachment>();
  const notebooks = new NotebooksByPath(repository);
  const textDecoder = new TextDecoder();

  for (const source of markdownSources) {
    const segments = source.path.split("/");
    const fileName = segments.pop() ?? source.path;
    const { frontMatter, markdown } = splitFrontMatter(textDecoder.decode(source.bytes));
    const notebookId = await notebooks.ensure(segments);
    const note = await repository.createNote({
      title: frontMatter.title ?? fileName.replace(MARKDOWN_FILE_PATTERN, ""),
      notebookIds: notebookId === null ? [] : [notebookId],
    });
    await writeMarkdownToBody(markdown, note.body, {
      noteExists: (noteId) => repository.note(noteId) !== undefined,
      attachFile: async (relative) => {
        const path = resolveRelativePath(source.path, relative);
        const attached = path === null ? undefined : sourcesByPath.get(path.toLowerCase());
        if (!attached || MARKDOWN_FILE_PATTERN.test(attached.path) || attached.bytes.length > MAX_ATTACHMENT_BYTES) {
          return null;
        }
        // 複数のメモが同じファイルを指していても、添付は 1 つにする。
        const stored = storedAttachments.get(attached.path) ?? await storeAttachment(repository, attached);
        storedAttachments.set(attached.path, stored);
        return stored;
      },
    });
  }
  await repository.flush();
  return { noteCount: markdownSources.length };
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

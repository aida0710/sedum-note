// メモの本文を、ファイルに書き出さずに Markdown でやり取りするとき（MCP、アプリ内の AI）の、リンクの扱い。
// 添付は ID を指すリンク（sedum-note://attachment/<ID>）にし、戻すときは、どこかのメモに貼ってある添付へ戻す。

import type { NoteRepository } from "../../core/notes/noteRepository";
import { ATTACHMENT_HREF_PREFIX, type BodyExportContext, type MarkdownImportContext } from "./markdownDocument";

export function markdownExportContextOf(repository: NoteRepository): BodyExportContext {
  return {
    attachmentHref: ({ id }) => `${ATTACHMENT_HREF_PREFIX}${id}`,
    noteTitle: (noteId) => repository.note(noteId)?.content.title ?? null,
  };
}

// 知らない ID と、ほかの形のリンクは添付にしない（リンクのまま残る）。
export function markdownImportContextOf(repository: NoteRepository): MarkdownImportContext {
  return {
    noteExists: (noteId) => repository.note(noteId) !== undefined,
    attachFile: async (href) => {
      if (!href.startsWith(ATTACHMENT_HREF_PREFIX)) {
        return null;
      }
      const attachmentId = href.slice(ATTACHMENT_HREF_PREFIX.length);
      const attachment = repository.notes().flatMap((note) => note.content.attachments).find((candidate) => candidate.id === attachmentId);
      return attachment ? { attachmentId, fileName: attachment.fileName, mimeType: attachment.mimeType, byteLength: attachment.byteLength } : null;
    },
  };
}

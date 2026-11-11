// 共有で受け取った文字とファイルから、新しいメモを作る。開いているメモには入れない
// （どのメモに入ったかが分からなくなるため）。

import type { JSONContent } from "@tiptap/core";
import { prosemirrorJSONToYXmlFragment } from "@tiptap/y-tiptap";
import { ATTACHMENT_FILE_NODE, ATTACHMENT_IMAGE_NODE } from "../../core/notes/bodyText";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { MAX_ATTACHMENT_BYTES } from "../editor/attachFiles";
import { documentSchema } from "../editor/documentSchema";
import { translate } from "../i18n/translate";
import type { SharedContent, SharedFile } from "../platform/sharedContent";

// 文字の 1 行目をタイトルにするときの長さの上限（文字数）。
const TITLE_MAX_LENGTH = 80;
const URL_PATTERN = /https?:\/\/[^\s<>"]+/g;

export async function createNoteFromSharedContent(repository: NoteRepository, shared: SharedContent): Promise<string> {
  const lines = shared.text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
  const title = shared.subject.trim() || [...(lines[0] ?? shared.files[0]?.fileName ?? translate("share.untitled"))].slice(0, TITLE_MAX_LENGTH).join("");
  const blocks: JSONContent[] = lines.map(paragraphWithLinks);
  for (const file of shared.files) {
    blocks.push(await attachmentBlock(repository, file));
  }
  // 最後に空の段落を置き、開いてすぐ続きを打てるようにする。
  blocks.push({ type: "paragraph" });
  const note = await repository.createNote({ title });
  note.body.delete(0, note.body.length);
  prosemirrorJSONToYXmlFragment(documentSchema(), { type: "doc", content: blocks }, note.body);
  await repository.flush();
  return note.id;
}

// 行の中の URL をリンクにする。
function paragraphWithLinks(line: string): JSONContent {
  const content: JSONContent[] = [];
  let position = 0;
  for (const match of line.matchAll(URL_PATTERN)) {
    if (match.index > position) {
      content.push({ type: "text", text: line.slice(position, match.index) });
    }
    content.push({ type: "text", text: match[0], marks: [{ type: "link", attrs: { href: match[0] } }] });
    position = match.index + match[0].length;
  }
  if (position < line.length) {
    content.push({ type: "text", text: line.slice(position) });
  }
  return { type: "paragraph", content };
}

// 添付できないファイル（大きすぎる、共有元から読めない）は、その旨を本文に書く（黙って落とさない）。
async function attachmentBlock(repository: NoteRepository, file: SharedFile): Promise<JSONContent> {
  const bytes = file.byteLength !== null && file.byteLength > MAX_ATTACHMENT_BYTES ? null : file.read(MAX_ATTACHMENT_BYTES);
  if (bytes === null) {
    return { type: "paragraph", content: [{ type: "text", text: translate("share.fileNotAttached", { name: file.fileName }) }] };
  }
  const reference = await repository.storeAttachment({ bytes, mimeType: file.mimeType, fileName: file.fileName });
  return {
    type: file.mimeType.startsWith("image/") ? ATTACHMENT_IMAGE_NODE : ATTACHMENT_FILE_NODE,
    attrs: { attachmentId: reference.id, fileName: file.fileName, mimeType: file.mimeType, byteLength: bytes.length },
  };
}

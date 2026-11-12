// メモの本文（Yjs の XmlFragment。Tiptap の文書）から、一覧の要約・検索・タグに使う平文と、
// 貼ってある添付を取り出す。エディタのライブラリを通さずに読むので、コアの試験でも使える。

import * as Y from "yjs";
import type { AttachmentReference } from "./noteRecords";

// 段落や見出しなど、後ろで改行にするブロックの種類（Tiptap のノード名）。
const BLOCK_NODE_NAMES = new Set(["paragraph", "heading", "listItem", "taskItem", "blockquote", "codeBlock", "tableCell", "tableHeader"]);
// 本文に貼った写真のノード（src/ui/editor/attachmentImageNode.tsx）。
export const ATTACHMENT_IMAGE_NODE = "attachmentImage";
// 本文に添付した写真以外のファイルのノード（src/ui/editor/attachmentFileNode.tsx）。
export const ATTACHMENT_FILE_NODE = "attachmentFile";
// ほかのメモへのリンクのノード（src/ui/editor/noteLinkNode.tsx）。リンク先はメモの ID で持つ。
export const NOTE_LINK_NODE = "noteLink";
const ATTACHMENT_NODE_NAMES = new Set([ATTACHMENT_IMAGE_NODE, ATTACHMENT_FILE_NODE]);

type BodyNode = Y.XmlFragment | Y.XmlElement | Y.XmlText | Y.XmlHook;

export function bodyPlainText(body: Y.XmlFragment): string {
  const parts: string[] = [];
  collectText(body, parts);
  return parts.join("").replace(/\n{2,}/g, "\n").trim();
}

// 本文の中の 1 つのノードの平文。
export function nodePlainText(node: Y.XmlElement): string {
  const parts: string[] = [];
  collectText(node, parts);
  return parts.join("").replace(/\n{2,}/g, "\n").trim();
}

function collectText(node: BodyNode, parts: string[]): void {
  if (node instanceof Y.XmlText) {
    // toString は書式をタグとして含むので、挿入された文字だけを拾う。
    for (const operation of node.toDelta() as Array<{ insert?: unknown }>) {
      if (typeof operation.insert === "string") {
        parts.push(operation.insert);
      }
    }
    return;
  }
  if (node instanceof Y.XmlHook) {
    return;
  }
  for (const child of node.toArray()) {
    collectText(child as BodyNode, parts);
  }
  if (node instanceof Y.XmlElement && BLOCK_NODE_NAMES.has(node.nodeName)) {
    parts.push("\n");
  }
}

// 本文に貼ってある添付（写真とファイル）。本文のノードから導くので、別に持つ一覧と食い違うことがない。
export function bodyAttachments(body: Y.XmlFragment): AttachmentReference[] {
  const attachments: AttachmentReference[] = [];
  const visit = (node: BodyNode) => {
    if (node instanceof Y.XmlElement && ATTACHMENT_NODE_NAMES.has(node.nodeName)) {
      const id = node.getAttribute("attachmentId");
      if (typeof id === "string") {
        attachments.push({
          id,
          mimeType: String(node.getAttribute("mimeType") ?? "application/octet-stream"),
          fileName: String(node.getAttribute("fileName") ?? ""),
          byteLength: Number(node.getAttribute("byteLength") ?? 0) || 0,
        });
      }
    }
    if (node instanceof Y.XmlFragment || node instanceof Y.XmlElement) {
      node.toArray().forEach((child) => visit(child as BodyNode));
    }
  };
  visit(body);
  return attachments;
}

// 本文の中の、ほかのメモへのリンクが指すメモの ID（重なりなし）。
export function bodyLinkedNoteIds(body: Y.XmlFragment): string[] {
  const noteIds = new Set<string>();
  const visit = (node: BodyNode) => {
    if (node instanceof Y.XmlElement && node.nodeName === NOTE_LINK_NODE) {
      const noteId = node.getAttribute("noteId");
      if (typeof noteId === "string") {
        noteIds.add(noteId);
      }
    }
    if (node instanceof Y.XmlFragment || node instanceof Y.XmlElement) {
      node.toArray().forEach((child) => visit(child as BodyNode));
    }
  };
  visit(body);
  return [...noteIds];
}

// UpNote と同じく、本文の「#言葉」をタグとして扱う。見出しの記号と区別するため、
// # の直後に空白を置かないものだけを拾う。
const HASHTAG_PATTERN = /(?:^|[\s　(（])#([\p{L}\p{N}_\-/]+)/gu;

export function plainTextHashtags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    if (match[1]) {
      tags.add(match[1]);
    }
  }
  return [...tags];
}

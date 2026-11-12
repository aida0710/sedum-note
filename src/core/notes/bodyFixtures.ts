// 試験で、エディタの代わりに本文（Yjs の XmlFragment）へ直接書くための道具。

import * as Y from "yjs";
import { ATTACHMENT_FILE_NODE, ATTACHMENT_IMAGE_NODE } from "./bodyText";
import type { AttachmentReference } from "./noteRecords";

export function appendParagraph(body: Y.XmlFragment, text: string): void {
  const paragraph = new Y.XmlElement("paragraph");
  paragraph.insert(0, [new Y.XmlText(text)]);
  body.insert(body.length, [paragraph]);
}

// チェックリストに、項目を 1 つ足す（チェックリストは項目ごとに 1 つ作る）。
export function appendTaskItem(body: Y.XmlFragment, text: string, checked = false): void {
  const paragraph = new Y.XmlElement("paragraph");
  paragraph.insert(0, [new Y.XmlText(text)]);
  const taskItem = new Y.XmlElement("taskItem");
  // 属性は ProseMirror の JSON と同じ形（真偽値のまま）で入れる。
  taskItem.setAttribute("checked", checked as unknown as string);
  taskItem.insert(0, [paragraph]);
  const taskList = new Y.XmlElement("taskList");
  taskList.insert(0, [taskItem]);
  body.insert(body.length, [taskList]);
}

export function appendAttachmentImage(body: Y.XmlFragment, attachment: AttachmentReference): void {
  appendAttachment(body, ATTACHMENT_IMAGE_NODE, attachment);
}

export function appendAttachmentFile(body: Y.XmlFragment, attachment: AttachmentReference): void {
  appendAttachment(body, ATTACHMENT_FILE_NODE, attachment);
}

function appendAttachment(body: Y.XmlFragment, nodeName: string, attachment: AttachmentReference): void {
  const image = new Y.XmlElement(nodeName);
  image.setAttribute("attachmentId", attachment.id);
  image.setAttribute("mimeType", attachment.mimeType);
  image.setAttribute("fileName", attachment.fileName);
  // 属性は ProseMirror の JSON と同じ形（数値は数値のまま）で入れる。
  image.setAttribute("byteLength", attachment.byteLength as unknown as string);
  body.insert(body.length, [image]);
}

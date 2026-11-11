// 試験で、エディタの代わりに本文（Yjs の XmlFragment）へ直接書くための道具。

import * as Y from "yjs";
import { ATTACHMENT_FILE_NODE, ATTACHMENT_IMAGE_NODE } from "./bodyText";
import type { AttachmentReference } from "./noteRecords";

export function appendParagraph(body: Y.XmlFragment, text: string): void {
  const paragraph = new Y.XmlElement("paragraph");
  paragraph.insert(0, [new Y.XmlText(text)]);
  body.insert(body.length, [paragraph]);
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
  body.insert(body.length, [image]);
}

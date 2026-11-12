// Markdown を、本文の末尾に足す。今ある本文は消さないので、ほかのデバイスの同時の編集と一緒に残る。

import * as Y from "yjs";
import { copyBodyBlocks } from "../../core/notes/bodyCopy";
import { type MarkdownImportContext, writeMarkdownToBody } from "./markdownDocument";

export async function appendMarkdownToBody(markdown: string, body: Y.XmlFragment, context: MarkdownImportContext): Promise<void> {
  // いったん別の文書に入れてから、できたノードを写す。
  const staging = new Y.Doc();
  const staged = staging.getXmlFragment("staged");
  await writeMarkdownToBody(markdown, staged, context, "drop");
  body.insert(body.length, copyBodyBlocks(staged));
  staging.destroy();
}

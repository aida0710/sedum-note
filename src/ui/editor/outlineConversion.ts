// ふつうのメモの本文を、アウトライン（1 つの箇条書き）に書き換える。アウトライン表示に切り替えるときに 1 回だけ使う。
// エディタを通さずに本文を直接書き換える（切り替えの前後でエディタを作り直すので、エディタの状態は当てにできない）。

import type { JSONContent } from "@tiptap/core";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import type * as Y from "yjs";
import { documentSchema } from "./documentSchema";
import { isOutlineBody, outlineFromBody } from "./outlineMode";

export function convertBodyToOutline(body: Y.XmlFragment): void {
  const document = documentSchema().nodeFromJSON(yXmlFragmentToProsemirrorJSON(body) as JSONContent);
  if (isOutlineBody(document)) {
    return;
  }
  const outline = outlineFromBody(document).toJSON() as JSONContent;
  const replaceBody = () => {
    body.delete(0, body.length);
    prosemirrorJSONToYXmlFragment(documentSchema(), outline, body);
  };
  // 消すのと入れるのを 1 つの変更にして、途中の空の本文が保存や同期に出ないようにする。
  if (body.doc) {
    body.doc.transact(replaceBody);
  } else {
    replaceBody();
  }
}

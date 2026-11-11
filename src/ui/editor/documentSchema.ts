// エディタと同じ文書の形（ProseMirror のスキーマ）。エディタを開かずに本文を作るとき
// （Markdown の取り込み、共有から受け取ったメモ）に使う。

import { getSchema } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { documentExtensions } from "./editorExtensions";

let schema: Schema | null = null;

// 拡張の組み立ては重いので、最初に使うときに 1 回だけ行う。
export function documentSchema(): Schema {
  schema ??= getSchema(documentExtensions());
  return schema;
}

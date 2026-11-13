// 本文の変更が、書いてある中身を変えたかを見分ける。
//
// 折りたたみの開け閉めと、リンクの先に選ばれたブロックへ付ける ID は、本文の属性として保存して同期する
// （折りたたみはほかのデバイスにも出し、ID はリンクをたどるのに要る）。ただ、書いてある中身は変わらないので、
// メモを編集したことにはしない。編集にすると、開け閉めやリンクを張るたびに更新日時が動いて「更新した順」の並びが変わり、
// 中身の同じ履歴が増える。

import * as Y from "yjs";
import { BLOCK_ID_ATTRIBUTE, LINKABLE_BLOCK_NODE_NAMES } from "./bodyBlocks";

// 折りたたんだかどうかを持つ属性（ui/editor/folding.ts）。
export const FOLDED_ATTRIBUTE = "collapsed";

// 中身を変えない属性だけを書き換えた変更なら false。何も変えていない変更は、念のため中身を変えたものとして扱う。
export function changesBodyContent(transaction: Y.Transaction): boolean {
  if (transaction.changed.size === 0) {
    return true;
  }
  for (const [type, keys] of transaction.changed) {
    if (!(type instanceof Y.XmlElement)) {
      return true;
    }
    for (const key of keys) {
      if (!isAttributeOutsideContent(type.nodeName, key)) {
        return true;
      }
    }
  }
  return false;
}

// key が null なのは、属性ではなく子（文字やブロック）が変わったとき。
function isAttributeOutsideContent(nodeName: string, key: string | null): boolean {
  return key === FOLDED_ATTRIBUTE || (key === BLOCK_ID_ATTRIBUTE && LINKABLE_BLOCK_NODE_NAMES.includes(nodeName));
}

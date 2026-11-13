// 日本語入力をオンのまま打つ記号でも、行頭で箇条書きにする（「- 」「1. 」と同じ変換）。
//   点の箇条書き: 行頭の「・」「ー」「－」「＊」「＋」のあとに空白（全角の空白でもよい）
//   番号付き: 行頭の全角の数字と「．」か「.」、または半角の数字と「．」のあとに空白（半角の「1. 」は Tiptap の変換が受ける）
// 変換の直後の Backspace で打った文字に戻せるのは、ほかの変換と同じ（markdownShortcutUndo.ts）。

import { Extension, wrappingInputRule } from "@tiptap/core";

// JavaScript の \s は、全角の空白（U+3000）も含む。
const BULLET_MARK = /^\s*([・ー－＊＋])\s$/;
const ORDERED_MARK = /^(?:([０-９]+)[．.]|([0-9]+)．)\s$/;

// 全角の数字を半角にして、番号の始まりにする。
function startNumberOf(match: RegExpMatchArray): number {
  const digits = (match[1] ?? match[2] ?? "1").replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
  return Number(digits);
}

export const JapaneseListShortcuts = Extension.create({
  name: "japaneseListShortcuts",
  addInputRules() {
    const { bulletList, orderedList } = this.editor.schema.nodes;
    if (!bulletList || !orderedList) {
      return [];
    }
    return [
      wrappingInputRule({ find: BULLET_MARK, type: bulletList }),
      wrappingInputRule({
        find: ORDERED_MARK, type: orderedList,
        getAttributes: (match) => ({ start: startNumberOf(match) }),
        // 前の番号付きの箇条書きの続きの番号なら、その箇条書きにつなぐ（「1. 」の変換と同じ）。
        joinPredicate: (match, node) => node.childCount + Number(node.attrs.start) === startNumberOf(match),
      }),
    ];
  },
});

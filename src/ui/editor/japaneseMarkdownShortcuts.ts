// 日本語入力をオンのまま打つ全角の記号でも、行頭で書式に変える（「- 」「1. 」「# 」「> 」「[ ] 」と同じ変換）。
//   点の箇条書き: 「・」「ー」「－」「＊」「＋」のあとに空白（全角の空白でもよい）
//   番号付き: 全角の数字と「．」か「.」、または半角の数字と「．」のあとに空白（半角の「1. 」は Tiptap の変換が受ける）
//   見出し: 「＃」を 1〜6 個（半角の # が混ざってもよい）のあとに空白
//   引用: 「＞」のあとに空白
//   チェックリスト: 「［］」「［ ］」「［ｘ］」のあとに空白（かっこの片方が半角でもよい）
// 変換の直後の Backspace で打った文字に戻せるのは、ほかの変換と同じ（markdownShortcutUndo.ts）。

import { Extension, textblockTypeInputRule, wrappingInputRule } from "@tiptap/core";

// JavaScript の \s は、全角の空白（U+3000）も含む。
const BULLET_MARK = /^\s*([・ー－＊＋])\s$/;
const ORDERED_MARK = /^(?:([０-９]+)[．.]|([0-9]+)．)\s$/;
// 全角の ＃ を 1 つ以上含むもの（半角だけの # は Tiptap の変換が受ける）。
const HEADING_MARK = /^(?=[#＃]*＃)([#＃]{1,6})\s$/;
const BLOCKQUOTE_MARK = /^\s*＞\s$/;
// 全角のかっこを 1 つ以上含むもの（半角だけの [ ] は Tiptap の変換が受ける）。かっこの中は、空か空白か x。
const TASK_MARK = /^\s*(?:［([\s xXｘＸ]?)[］\]]|\[([\s xXｘＸ]?)］)\s$/;

// 全角の数字を半角にして、番号の始まりにする。
function startNumberOf(match: RegExpMatchArray): number {
  const digits = (match[1] ?? match[2] ?? "1").replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
  return Number(digits);
}

// かっこの中に x があれば、チェック済みで始める。
function isCheckedMark(match: RegExpMatchArray): boolean {
  return /[xXｘＸ]/.test(match[1] ?? match[2] ?? "");
}

export const JapaneseMarkdownShortcuts = Extension.create({
  name: "japaneseMarkdownShortcuts",
  addInputRules() {
    const { bulletList, orderedList, heading, blockquote, taskItem } = this.editor.schema.nodes;
    if (!bulletList || !orderedList || !heading || !blockquote || !taskItem) {
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
      textblockTypeInputRule({ find: HEADING_MARK, type: heading, getAttributes: (match) => ({ level: (match[1] ?? "").length }) }),
      wrappingInputRule({ find: BLOCKQUOTE_MARK, type: blockquote }),
      wrappingInputRule({ find: TASK_MARK, type: taskItem, getAttributes: (match) => ({ checked: isCheckedMark(match) }) }),
    ];
  },
});

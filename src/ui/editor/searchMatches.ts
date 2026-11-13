// メモの中の検索で、本文から当たりを探す。探し方は 3 つの切り替えの組み合わせ。
//   正規表現: 打った文字を正規表現として読む。切っているときは、空白で区切った言葉のどれかに当たり、
//     全角と半角を区別しない（「ABC」で「ＡＢＣ」に当たる。メモ全体の検索と同じ。core/notes/searchTextFolding.ts）。
//   大文字と小文字を区別: 切っているときは区別しない。
//   単語単位: 前後が文字（かなや漢字を含む）か数字でない所だけに当たる。
// 段落ごとに文字をつなげて探す（太字などの書式の境目をまたぐ言葉も当たるように）。

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { type FoldedText, foldWithPositions, originalRangeOf } from "../../core/notes/searchTextFolding";

export type SearchOptions = { regex: boolean; caseSensitive: boolean; wholeWord: boolean };

// 左の列の検索の言葉に色を付けるときと、検索の欄を開いたときの探し方。
export const DEFAULT_SEARCH_OPTIONS: SearchOptions = { regex: false, caseSensitive: false, wholeWord: false };

export type SearchMatch = {
  from: number;
  to: number;
  // 置換の文字を、この当たりに入れる文字にする。正規表現では $1 や $& をこの当たりの中身で展開する。
  replacementFor: (replacement: string) => string;
};

export type SearchResult = {
  matches: SearchMatch[];
  // 正規表現として読めなかったとき true。当たりは空。
  invalidPattern: boolean;
};

// 文字でないもの（メモへのリンクなど）の代わりに置く文字。当たりがそこをまたがないようにする（置き換えると消えてしまう）。
const INLINE_ATOM_PLACEHOLDER = "￼";
// 単語の境目。前後が文字（\p{L}。かなや漢字も入る）・数字・_ でない所。英語の \b は ASCII の文字しか見ないので使わない。
const WORD_START = "(?<![\\p{L}\\p{N}_])";
const WORD_END = "(?![\\p{L}\\p{N}_])";

const NO_MATCH: SearchResult = { matches: [], invalidPattern: false };

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 打った文字と切り替えから、探す正規表現の元の文字を作る。
function patternOf(query: string, { regex, wholeWord }: SearchOptions): string {
  const pattern = regex ? query : query.split(/\s+/).filter((word) => word !== "").map(escapeRegex).join("|");
  return wholeWord ? `${WORD_START}(?:${pattern})${WORD_END}` : pattern;
}

export function findSearchMatches(doc: ProseMirrorNode, query: string, options: SearchOptions): SearchResult {
  if (query.trim() === "") {
    return NO_MATCH;
  }
  // 正規表現は書いたとおりに読む（そろえると、式の記号まで変わる）。言葉で探すときは、本文と言葉の両方の全角と半角をそろえる。
  const foldText = options.regex ? null : (text: string) => foldWithPositions(text, { keepsCase: options.caseSensitive });
  const searchedQuery = foldText === null ? query : foldText(query).text;
  let regex: RegExp;
  try {
    // u は、絵文字のようなサロゲートペアを 1 文字として扱い、\p{L} を使うため。
    regex = new RegExp(patternOf(searchedQuery, options), options.caseSensitive ? "gu" : "giu");
  } catch {
    return { matches: [], invalidPattern: true };
  }
  return { matches: collectMatches(doc, regex, foldText), invalidPattern: false };
}

// 段落（文字を持つブロック）ごとに、つなげた文字と、その先頭の位置を渡す。
function forEachTextblock(doc: ProseMirrorNode, visit: (text: string, start: number) => void): void {
  doc.descendants((node, position) => {
    if (!node.isTextblock) {
      return true;
    }
    let text = "";
    node.forEach((child) => {
      text += child.isText ? child.text ?? "" : INLINE_ATOM_PLACEHOLDER.repeat(child.nodeSize);
    });
    visit(text, position + 1);
    return false;
  });
}

// foldText を渡したとき（言葉で探すとき）は、そろえた文字で探し、当たりを元の文字の位置へ戻す。置換の文字はそのまま入れる。
// 渡さないとき（正規表現で探すとき）は、元の文字で探し、置換の文字の $1 などを当たりの中身で展開する。
function collectMatches(doc: ProseMirrorNode, regex: RegExp, foldText: ((text: string) => FoldedText) | null): SearchMatch[] {
  const matches: SearchMatch[] = [];
  forEachTextblock(doc, (text, start) => {
    const folded = foldText?.(text) ?? null;
    for (const found of (folded?.text ?? text).matchAll(regex)) {
      const range = folded ? originalRangeOf(folded, { index: found.index, length: found[0].length }) : { index: found.index, length: found[0].length };
      // 空の当たり（^ や a*）は、色も付けられず置き換えても意味が無いので数えない。
      if (range === null || range.length === 0 || text.slice(range.index, range.index + range.length).includes(INLINE_ATOM_PLACEHOLDER)) {
        continue;
      }
      matches.push({
        from: start + range.index, to: start + range.index + range.length,
        replacementFor: (replacement) => (folded ? replacement : expandRegexReplacement(replacement, found, text)),
      });
    }
  });
  return matches;
}

// 置換の文字の $1・$&・$<名前>・$$・$` ・$' を、この当たりの中身で展開する（String.prototype.replace と同じ決まり）。
// 段落の文字で探したときの当たりをそのまま使うので、後読みや ^ のように前後の文字を見る式でも、探したときと同じ中身になる。
// ブラウザの replace に任せないのは、WebKit が sticky（y）の式で lastIndex を見ず、当たりの位置を指定できないため。
function expandRegexReplacement(replacement: string, found: RegExpExecArray, text: string): string {
  const matched = found[0];
  const captures = found.slice(1);
  return replacement.replace(/\$(\$|&|`|'|\d{1,2}|<([^>]*)>)/g, (token, symbol: string, groupName: string | undefined) => {
    switch (symbol) {
      case "$":
        return "$";
      case "&":
        return matched;
      case "`":
        return text.slice(0, found.index);
      case "'":
        return text.slice(found.index + matched.length);
    }
    if (groupName !== undefined) {
      return found.groups ? found.groups[groupName] ?? "" : token;
    }
    // $12 は、12 番目の括弧が無ければ、$1 のあとに「2」が続くと読む。
    const twoDigits = Number(symbol);
    if (twoDigits >= 1 && twoDigits <= captures.length) {
      return captures[twoDigits - 1] ?? "";
    }
    const oneDigit = Number(symbol[0]);
    if (symbol.length === 2 && oneDigit >= 1 && oneDigit <= captures.length) {
      return (captures[oneDigit - 1] ?? "") + symbol[1];
    }
    return token;
  });
}

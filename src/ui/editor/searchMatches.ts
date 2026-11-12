// メモの中の検索で、本文から当たりを探す。言葉（空白で区切った言葉のどれか）と、正規表現の 2 つの探し方がある。
// 段落ごとに文字をつなげて探す（太字などの書式の境目をまたぐ言葉も当たるように）。

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export type SearchMode = "words" | "regex";

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
// 大文字と小文字を区別しない。u は、絵文字のようなサロゲートペアを 1 文字として扱うため。
const REGEX_FLAGS = "giu";

const NO_MATCH: SearchResult = { matches: [], invalidPattern: false };

export function findSearchMatches(doc: ProseMirrorNode, query: string, mode: SearchMode): SearchResult {
  if (query.trim() === "") {
    return NO_MATCH;
  }
  if (mode === "regex") {
    return findRegexMatches(doc, query);
  }
  return { matches: findWordMatches(doc, query), invalidPattern: false };
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

function findWordMatches(doc: ProseMirrorNode, query: string): SearchMatch[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter((word) => word !== "");
  const matches: SearchMatch[] = [];
  forEachTextblock(doc, (text, start) => {
    const haystack = text.toLocaleLowerCase();
    // 小文字にすると長さが変わる文字があると位置がずれるので、そのときはこの段落を飛ばす。
    if (haystack.length !== text.length) {
      return;
    }
    for (const word of words) {
      for (let index = haystack.indexOf(word); index !== -1; index = haystack.indexOf(word, index + word.length)) {
        matches.push({ from: start + index, to: start + index + word.length, replacementFor: (replacement) => replacement });
      }
    }
  });
  return matches.sort((left, right) => left.from - right.from);
}

function findRegexMatches(doc: ProseMirrorNode, pattern: string): SearchResult {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, REGEX_FLAGS);
  } catch {
    return { matches: [], invalidPattern: true };
  }
  const matches: SearchMatch[] = [];
  forEachTextblock(doc, (text, start) => {
    for (const found of text.matchAll(regex)) {
      const matched = found[0];
      // 空の当たり（^ や a*）は、色も付けられず置き換えても意味が無いので数えない。
      if (matched.length === 0 || matched.includes(INLINE_ATOM_PLACEHOLDER)) {
        continue;
      }
      matches.push({
        from: start + found.index, to: start + found.index + matched.length,
        replacementFor: (replacement) => expandRegexReplacement(replacement, found, text),
      });
    }
  });
  return { matches, invalidPattern: false };
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

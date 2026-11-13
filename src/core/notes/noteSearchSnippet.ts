// メモ全体の検索の結果に添える、本文の中の当たった所と、その前後の文。どの言葉で当たったのかを、題だけでなく
// 本文の一部で見せる（noteSearchQuery.ts の言葉で探す）。

export type SearchSnippet = {
  // 当たった言葉の前の文と後ろの文。本文の途中で切ったときは、切った側に「…」を付ける。
  before: string;
  match: string;
  after: string;
};

// 当たった言葉の前と後ろに出す文字の数。左の列の 1 行に収まり、前後の文脈が分かる程度にした（後ろを長くする）。
const CHARACTERS_BEFORE = 12;
const CHARACTERS_AFTER = 40;
const ELLIPSIS = "…";

function singleLine(text: string): string {
  return text.replace(/\s+/g, " ");
}

// words は、小文字にした探す言葉（NoteSearchQuery.words）。本文で最初に当たった言葉の所を返す。
// 本文で当たらなければ（題だけで当たった、言葉が無い）null。
export function searchSnippetOf(plainText: string, words: readonly string[]): SearchSnippet | null {
  const lowered = plainText.toLocaleLowerCase();
  // 小文字にすると文字の数が変わる文字（トルコ語の İ など）があると、位置が合わないので出さない。
  if (lowered.length !== plainText.length) {
    return null;
  }
  let found: { index: number; length: number } | null = null;
  for (const word of words) {
    const index = word === "" ? -1 : lowered.indexOf(word);
    if (index >= 0 && (found === null || index < found.index)) {
      found = { index, length: word.length };
    }
  }
  if (found === null) {
    return null;
  }
  const start = Math.max(0, found.index - CHARACTERS_BEFORE);
  const end = Math.min(plainText.length, found.index + found.length + CHARACTERS_AFTER);
  return {
    before: (start > 0 ? ELLIPSIS : "") + singleLine(plainText.slice(start, found.index)).trimStart(),
    match: plainText.slice(found.index, found.index + found.length),
    after: singleLine(plainText.slice(found.index + found.length, end)).trimEnd() + (end < plainText.length ? ELLIPSIS : ""),
  };
}

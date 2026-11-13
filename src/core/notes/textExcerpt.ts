// 本文の中の、言葉が当たった所の前後を 1 行にした抜き出し。
// コマンドパレット（本文だけに当たったメモ）が、当たった所を見せるのに使う。

// 当たった言葉の前と後ろに付ける文字数。前は短くして、当たった言葉が行の頭の近くに来るようにする。
const EXCERPT_BEFORE = 8;
const EXCERPT_AFTER = 24;

export type TextMatch = { index: number; length: number };

export function excerptAt(text: string, { index, length }: TextMatch): string {
  const start = Math.max(0, index - EXCERPT_BEFORE);
  const end = index + length + EXCERPT_AFTER;
  const excerpt = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${excerpt}${end < text.length ? "…" : ""}`;
}

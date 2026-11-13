// 探すときに、見た目が同じ文字の書き方の違いをそろえる。
// 全角と半角（「ＡＢＣ」と「ABC」、「１２３」と「123」、「ﾒﾓ」と「メモ」）、大文字と小文字を、同じ文字として比べる。
// ひらがなとカタカナは別の文字のままにする。

function foldCharacters(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase();
}

// 当たるかどうかだけを見るとき（位置が要らないとき）に使う。
export function foldForSearch(text: string): string {
  return foldCharacters(text);
}

// そろえた文字列と、その各文字が元の文字列のどこから来たか。
// そろえると文字の数が変わる（「ｶﾞ」は 2 文字から「ガ」1 文字に、「㍍」は 1 文字から「メートル」4 文字になる）ので、
// 当たった所を元の文字列の位置へ戻すのに使う。
export type FoldedText = {
  text: string;
  // そろえた文字列の i 文字目の元になった、元の文字列のまとまりの始まりと終わり。
  originalStarts: number[];
  originalEnds: number[];
};

// 1 つにまとまる文字の並び（元の文字と、それに付く濁点・半濁点・結合文字）。まとまりごとにそろえると、
// 文字列全体をそろえたのと同じ結果になり、まとまりの位置も分かる。
const CHARACTER_WITH_MARKS = /[\s\S][\p{M}ﾞﾟ]*/gu;

export function foldWithPositions(text: string): FoldedText {
  const folded: FoldedText = { text: "", originalStarts: [], originalEnds: [] };
  for (const match of text.matchAll(CHARACTER_WITH_MARKS)) {
    const foldedCluster = foldCharacters(match[0]);
    folded.text += foldedCluster;
    for (let index = 0; index < foldedCluster.length; index += 1) {
      folded.originalStarts.push(match.index);
      folded.originalEnds.push(match.index + match[0].length);
    }
  }
  return folded;
}

export type TextRange = { index: number; length: number };

// そろえた文字列の中の範囲を、元の文字列の範囲にする。範囲が空なら null。
export function originalRangeOf(folded: FoldedText, foldedRange: TextRange): TextRange | null {
  const start = folded.originalStarts[foldedRange.index];
  const end = folded.originalEnds[foldedRange.index + foldedRange.length - 1];
  if (foldedRange.length <= 0 || start === undefined || end === undefined) {
    return null;
  }
  return { index: start, length: end - start };
}

// text の中で、そろえた言葉（foldForSearch を通したもの）が最初に当たる所を、元の文字列の範囲で返す。当たらなければ null。
export function findFoldedWord(text: string, foldedWord: string): TextRange | null {
  if (foldedWord === "") {
    return null;
  }
  const folded = foldWithPositions(text);
  const index = folded.text.indexOf(foldedWord);
  return index === -1 ? null : originalRangeOf(folded, { index, length: foldedWord.length });
}

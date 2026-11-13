import { describe, expect, it } from "vitest";
import { findFoldedWord, foldForSearch, foldWithPositions } from "./searchTextFolding";

describe("foldForSearch", () => {
  it("全角と半角、大文字と小文字を同じ文字にそろえる", () => {
    expect(foldForSearch("ＡＢＣ１２３")).toBe("abc123");
    expect(foldForSearch("ﾒﾓ")).toBe("メモ");
    expect(foldForSearch("ｶﾞｲﾄﾞ")).toBe("ガイド");
    expect(foldForSearch("Sedum")).toBe("sedum");
  });

  it("ひらがなとカタカナは、別の文字のままにする", () => {
    expect(foldForSearch("めも")).not.toBe(foldForSearch("メモ"));
  });
});

describe("foldWithPositions", () => {
  it("まとまりごとにそろえた結果は、全体をそろえた結果と同じになる", () => {
    for (const text of ["ｶﾞｲﾄﾞ ＡＢＣ", "がき", "㍍と㌔", "Ａ-1 ﾊﾟﾝ", "😀ＯＫ"]) {
      expect(foldWithPositions(text).text).toBe(foldForSearch(text));
    }
  });
});

describe("findFoldedWord", () => {
  it("半角で打った言葉が、全角で書いた所に当たり、元の文字の範囲を返す", () => {
    expect(findFoldedWord("型番はＡＢＣ－１２３です", foldForSearch("abc"))).toEqual({ index: 3, length: 3 });
  });

  it("半角カナの濁点は前の文字とまとめて、元の 2 文字の範囲を返す", () => {
    const text = "旅行ｶﾞｲﾄﾞを読む";
    const range = findFoldedWord(text, foldForSearch("ガイド"));
    expect(range).toEqual({ index: 2, length: 5 });
    expect(text.slice(range!.index, range!.index + range!.length)).toBe("ｶﾞｲﾄﾞ");
  });

  it("1 文字が何文字にもなる字の途中で当たったら、その字の全体を範囲にする", () => {
    expect(findFoldedWord("長さ5㍍", foldForSearch("メー"))).toEqual({ index: 3, length: 1 });
  });

  it("当たらない・言葉が空なら null", () => {
    expect(findFoldedWord("メモ", foldForSearch("めも"))).toBeNull();
    expect(findFoldedWord("メモ", "")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { searchSnippetOf } from "./noteSearchSnippet";

describe("検索の結果に添える本文の一部", () => {
  it("最初に当たった言葉と、その前後の文を返す。大文字と小文字は区別しない", () => {
    expect(searchSnippetOf("持ち物: Passport と充電器", ["passport"])).toEqual({ before: "持ち物: ", match: "Passport", after: " と充電器" });
  });

  it("本文の途中で切ったときは、切った側に「…」を付け、改行は空白にする", () => {
    const plainText = `${"前".repeat(30)}\n当たり\n${"後".repeat(60)}`;
    const snippet = searchSnippetOf(plainText, ["当たり"])!;
    expect(snippet.before).toBe(`…${"前".repeat(11)} `);
    expect(snippet.match).toBe("当たり");
    expect(snippet.after).toBe(` ${"後".repeat(39)}…`);
  });

  it("いくつかの言葉のうち、本文で先に出てくる方の所を出す", () => {
    expect(searchSnippetOf("りんごとみかん", ["みかん", "りんご"])?.match).toBe("りんご");
  });

  it("本文で当たらなければ（題だけで当たった）出さない", () => {
    expect(searchSnippetOf("本文", ["題"])).toBeNull();
    expect(searchSnippetOf("本文", [])).toBeNull();
  });

  it("半角で探した言葉が全角で書いた所に当たったら、元の文字のまま抜き出す", () => {
    expect(searchSnippetOf("型番はＡＢＣ－１２３です", ["abc"])).toEqual({ before: "型番は", match: "ＡＢＣ", after: "－１２３です" });
  });
});

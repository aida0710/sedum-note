import { describe, expect, it } from "vitest";
import { compareCellTexts } from "./tableRowOrder";

const sorted = (values: string[], direction: "ascending" | "descending") =>
  [...values].sort((left, right) => compareCellTexts(left, right, direction));

describe("表のソートでのセルの比べ方", () => {
  it("数は、文字の順ではなく数の大小で並ぶ", () => {
    expect(sorted(["10", "9", "1,200", "100"], "ascending")).toEqual(["9", "10", "100", "1,200"]);
    expect(sorted(["10", "9", "100"], "descending")).toEqual(["100", "10", "9"]);
  });

  it("文字は文字の順で並ぶ", () => {
    expect(sorted(["みかん", "あんず", "りんご"], "ascending")).toEqual(["あんず", "みかん", "りんご"]);
  });

  it("空のセルは、昇順でも降順でも最後に来る", () => {
    expect(sorted(["", "2", "1"], "ascending")).toEqual(["1", "2", ""]);
    expect(sorted(["", "2", "1"], "descending")).toEqual(["2", "1", ""]);
  });
});

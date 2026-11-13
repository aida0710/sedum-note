import { describe, expect, it } from "vitest";
import { alignBlocks, diffBlocks } from "./blockDiff";

describe("ブロックの並びの差分", () => {
  it("同じ並びなら、入れ替える所は無い", () => {
    expect(diffBlocks(["a", "b"], ["a", "b"])).toEqual([]);
  });

  it("書き換えたブロックは、前の 1 つを後ろの 1 つに入れ替える", () => {
    expect(diffBlocks(["a", "b", "c"], ["a", "B", "c"])).toEqual([{ oldStart: 1, oldEnd: 2, newStart: 1, newEnd: 2 }]);
  });

  it("足したブロックと消したブロックを、それぞれ 1 か所にまとめ、変わっていないブロックは残す", () => {
    expect(diffBlocks(["a", "b", "c", "d"], ["a", "c", "x", "y", "d"])).toEqual([
      { oldStart: 1, oldEnd: 2, newStart: 1, newEnd: 1 },
      { oldStart: 3, oldEnd: 3, newStart: 2, newEnd: 4 },
    ]);
  });

  it("全部を消す・全部を足す", () => {
    expect(diffBlocks(["a", "b"], [])).toEqual([{ oldStart: 0, oldEnd: 2, newStart: 0, newEnd: 0 }]);
    expect(diffBlocks([], ["a"])).toEqual([{ oldStart: 0, oldEnd: 0, newStart: 0, newEnd: 1 }]);
  });
});

describe("元のブロックの単位での突き合わせ", () => {
  it("読み直すと形の変わるブロック（段組みなど）も、そのまま返ってくれば残し、足した所だけを入れる", () => {
    expect(alignBlocks([["A"], ["B", "C"], ["D"]], ["A", "B", "C", "D", "E"])).toEqual([{ oldStart: 3, oldEnd: 3, newStart: 4, newEnd: 5 }]);
  });

  it("中身が変わったブロックは、読み直した形の全部と入れ替える", () => {
    expect(alignBlocks([["A"], ["B", "C"], ["D"]], ["A", "B", "X", "D"])).toEqual([{ oldStart: 1, oldEnd: 2, newStart: 1, newEnd: 3 }]);
  });

  it("読み直した形の間に何か足されたら、そのブロックは残さない", () => {
    expect(alignBlocks([["A"], ["B", "C"]], ["A", "B", "Z", "C"])).toEqual([{ oldStart: 1, oldEnd: 2, newStart: 1, newEnd: 4 }]);
  });

  it("Markdown に出せないブロック（読み直した形が 0 個）は、いつも残す", () => {
    expect(alignBlocks([["A"], [], ["C"]], ["A", "C"])).toEqual([]);
    expect(alignBlocks([["A"], [], ["C"]], ["A", "X"])).toEqual([{ oldStart: 2, oldEnd: 3, newStart: 1, newEnd: 2 }]);
  });

  it("1 つずつのブロックなら、ブロックの並びの差分と同じになる", () => {
    expect(alignBlocks([["a"], ["b"], ["c"]], ["a", "B", "c"])).toEqual(diffBlocks(["a", "b", "c"], ["a", "B", "c"]));
    expect(alignBlocks([["a"], ["b"]], [])).toEqual([{ oldStart: 0, oldEnd: 2, newStart: 0, newEnd: 0 }]);
    expect(alignBlocks([], ["a"])).toEqual([{ oldStart: 0, oldEnd: 0, newStart: 0, newEnd: 1 }]);
  });
});

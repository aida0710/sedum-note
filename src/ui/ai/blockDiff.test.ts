import { describe, expect, it } from "vitest";
import { diffBlocks } from "./blockDiff";

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

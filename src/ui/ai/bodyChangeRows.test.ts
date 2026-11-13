import { describe, expect, it } from "vitest";
import type { BodyChangeProposal } from "../noteTools/noteBodyChange";
import { bodyChangeRows } from "./bodyChangeRows";

const proposal = (baseBlocks: string[], newBlockMarkdowns: string[], hunks: BodyChangeProposal["hunks"]): BodyChangeProposal => ({
  baseBlocks, blockIndexes: baseBlocks.map((_, index) => index), newBlocks: [], newBlockMarkdowns, hunks,
});

describe("承認のカードの差分の行", () => {
  it("変わらないブロックは行の数だけにし、変わった行は消す行と足す行にする", () => {
    const rows = bodyChangeRows(proposal(["りんご", "ばなな", "みかん"], ["りんご", "バナナ", "みかん", "ぶどう"], [
      { oldStart: 1, oldEnd: 2, newStart: 1, newEnd: 2 },
      { oldStart: 3, oldEnd: 3, newStart: 3, newEnd: 4 },
    ]));
    expect(rows).toEqual([
      { kind: "collapsed", lineCount: 1 },
      { kind: "removed", text: "ばなな" },
      { kind: "added", text: "バナナ" },
      { kind: "collapsed", lineCount: 1 },
      { kind: "added", text: "ぶどう" },
    ]);
  });

  it("入れ替えるブロックの中でも、同じ文の行は印を付けずに出す（箇条書きに項目を 1 つ足しても、前の項目は変わらない行）", () => {
    const rows = bodyChangeRows(proposal(["## 沖縄", "8 月 3 日に出発すろ。", "- 日焼け止め\n- 水着"], ["## 沖縄", "8 月 3 日に出発する。", "- 日焼け止め\n- 水着\n- サングラス"], [
      { oldStart: 1, oldEnd: 3, newStart: 1, newEnd: 3 },
    ]));
    expect(rows).toEqual([
      { kind: "collapsed", lineCount: 1 },
      { kind: "removed", text: "8 月 3 日に出発すろ。" },
      { kind: "added", text: "8 月 3 日に出発する。" },
      { kind: "context", text: "- 日焼け止め" },
      { kind: "context", text: "- 水着" },
      { kind: "added", text: "- サングラス" },
    ]);
  });

  it("続けて変わった行は、消す行と足す行を 1 行ずつ交互に並べる", () => {
    const rows = bodyChangeRows(proposal(["一\n二\n三"], ["壱\n弐"], [{ oldStart: 0, oldEnd: 1, newStart: 0, newEnd: 1 }]));
    expect(rows.map((row) => (row.kind === "collapsed" ? "…" : `${row.kind === "removed" ? "-" : "+"}${row.text}`))).toEqual(["-一", "+壱", "-二", "+弐", "-三"]);
  });
});

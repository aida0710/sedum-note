import { describe, expect, it } from "vitest";
import { type PaletteCandidate, searchPalette } from "./paletteItems";

const nothing = () => undefined;

function candidate(kind: PaletteCandidate["kind"], label: string, extraText = "", updatedAt?: string): PaletteCandidate {
  return { id: `${kind}:${label}`, kind, label, hint: "", run: nothing, extraText, updatedAt };
}

const candidates = [
  candidate("note", "旅行の持ち物", "パスポートと充電器", "2026-11-10"),
  candidate("note", "議事録", "次の旅行の予算を決めた", "2026-11-12"),
  candidate("notebook", "旅行"),
  candidate("tag", "旅行メモ"),
  candidate("setting", "テーマ", "設定 外観"),
  candidate("command", "新しいメモ"),
];

const labelsOf = (query: string) => searchPalette(candidates, query).map((item) => `${item.kind}:${item.label}`);

describe("コマンドパレットの絞り込み", () => {
  it("言葉を打つと、メモ・ノートブック・タグ・設定・操作をまとめて探し、種類の順に並べる", () => {
    expect(labelsOf("旅行")).toEqual(["note:旅行の持ち物", "note:議事録", "notebook:旅行", "tag:旅行メモ"]);
  });

  it("名前に当たったメモを、本文にだけ当たったメモより先に出し、本文の当たりには抜き出しを添える", () => {
    const [byTitle, byBody] = searchPalette(candidates, "旅行").filter((item) => item.kind === "note");
    expect(byTitle!.hint).toBe("");
    expect(byBody!.hint).toBe("次の旅行の予算を決めた");
  });

  it("設定の項目は、ページの名前でも当たる", () => {
    expect(labelsOf("外観")).toEqual(["setting:テーマ"]);
  });

  it("何も打っていないときは、最近のメモだけを新しい順に出す", () => {
    expect(labelsOf("")).toEqual(["note:議事録", "note:旅行の持ち物"]);
  });

  it("「>」で始めると、操作だけを探す", () => {
    expect(labelsOf(">")).toEqual(["command:新しいメモ"]);
    expect(labelsOf(">旅行")).toEqual([]);
  });
});

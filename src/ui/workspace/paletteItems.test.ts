import { describe, expect, it } from "vitest";
import { type PaletteCandidate, searchPalette } from "./paletteItems";

const nothing = () => undefined;

function candidate(kind: PaletteCandidate["kind"], label: string, extraText = "", updatedAt?: string): PaletteCandidate {
  return { id: `${kind}:${label}`, kind, label, hint: "", run: nothing, extraText, updatedAt };
}

function suggestedCommand(label: string): PaletteCandidate {
  return { ...candidate("command", label), suggested: true };
}

const candidates = [
  candidate("note", "旅行の持ち物", "パスポートと充電器", "2026-11-10"),
  candidate("note", "議事録", "次の旅行の予算を決めた", "2026-11-12"),
  candidate("notebook", "旅行"),
  candidate("tag", "旅行メモ"),
  candidate("setting", "テーマ", "設定 外観"),
  suggestedCommand("新しいメモ"),
  candidate("command", "フォーカスモード"),
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

  it("何も打っていないときは、最近のメモを新しい順に出し、その下によく使う操作だけを出す", () => {
    expect(labelsOf("")).toEqual(["note:議事録", "note:旅行の持ち物", "command:新しいメモ"]);
  });

  it("何も打っていないときに出す最近のメモは 8 件まで", () => {
    const manyNotes = Array.from({ length: 12 }, (_, index) => candidate("note", `メモ${index}`, "", `2026-11-${String(index + 1).padStart(2, "0")}`));
    const items = searchPalette([...manyNotes, suggestedCommand("新しいメモ")], "");
    expect(items.filter((item) => item.kind === "note").map((item) => item.label)).toEqual(["メモ11", "メモ10", "メモ9", "メモ8", "メモ7", "メモ6", "メモ5", "メモ4"]);
    expect(items.at(-1)!.label).toBe("新しいメモ");
  });

  it("「>」で始めると、よく使うものに限らず、操作だけを探す", () => {
    expect(labelsOf(">")).toEqual(["command:新しいメモ", "command:フォーカスモード"]);
    expect(labelsOf(">旅行")).toEqual([]);
  });
});

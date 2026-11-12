import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { buildNoteGraph, layoutNoteGraph } from "./noteGraph";
import type { NoteSummary } from "./noteQueries";

function summary(id: string, linkedNoteIds: string[] = [], overrides: { trashedAt?: string | null; isTemplate?: boolean } = {}): NoteSummary {
  return {
    plainText: "", tags: [], linkedNoteIds,
    note: {
      id, kind: "note", updatedAt: "2026-11-12T00:00:00.000Z", revision: 0, body: new Y.Doc().getXmlFragment("body"),
      content: {
        title: id, notebookIds: [], pinned: false, bookmarked: false, trashedAt: overrides.trashedAt ?? null, isTemplate: overrides.isTemplate ?? false,
        attachments: [], propertyValues: {}, createdAt: "2026-11-12T00:00:00.000Z",
      },
    },
  };
}

describe("グラフ表示", () => {
  it("メモを点に、リンクを線にする。互いにリンクしている 2 つのメモの線は 1 本にする", () => {
    const graph = buildNoteGraph([summary("a", ["b", "c"]), summary("b", ["a"]), summary("c"), summary("d")]);
    expect(graph.nodes.map((node) => [node.noteId, node.linkCount])).toEqual([["a", 2], ["b", 1], ["c", 1], ["d", 0]]);
    expect(graph.edges).toEqual([{ fromNoteId: "a", toNoteId: "b" }, { fromNoteId: "a", toNoteId: "c" }]);
  });

  it("ゴミ箱のメモ・テンプレート・無いメモへのリンクと、自分へのリンクは、線にしない", () => {
    const graph = buildNoteGraph([summary("a", ["a", "gone", "trashed", "template"]), summary("trashed", [], { trashedAt: "2026-11-12T00:00:00.000Z" }), summary("template", [], { isTemplate: true })]);
    expect(graph.nodes.map((node) => node.noteId)).toEqual(["a"]);
    expect(graph.edges).toEqual([]);
  });

  it("つながったメモは、つながっていないメモより近くに置く。同じメモなら、いつも同じ置き方になる", () => {
    const graph = buildNoteGraph([summary("a", ["b"]), summary("b"), summary("c"), summary("d")]);
    const points = layoutNoteGraph(graph);
    const distance = (left: string, right: string) => Math.hypot(points.get(left)!.x - points.get(right)!.x, points.get(left)!.y - points.get(right)!.y);
    expect(distance("a", "b")).toBeLessThan(distance("a", "c"));
    expect(distance("a", "b")).toBeLessThan(distance("b", "d"));
    expect([...layoutNoteGraph(graph)]).toEqual([...points]);
  });
});

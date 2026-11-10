import { describe, expect, it } from "vitest";
import { documentHashtags, documentPlainText } from "./documentText";
import type { LiveNote, LiveNotebook } from "./noteRecords";
import { buildNotebookTree, countTags, selectNotes, summarizeNote } from "./noteQueries";

function paragraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function note(id: string, overrides: Partial<LiveNote["content"]>, updatedAt: string): LiveNote {
  return {
    id, kind: "note", updatedAt, updatedBy: "d", removed: false,
    content: { title: "", document: null, notebookIds: [], pinned: false, bookmarked: false, trashedAt: null, attachments: [], createdAt: updatedAt, ...overrides },
  };
}

describe("documentPlainText", () => {
  it("段落ごとに改行を入れて本文の文字を取り出す", () => {
    expect(documentPlainText({ type: "doc", content: [paragraph("一行目"), paragraph("二行目")] })).toBe("一行目\n二行目");
  });
});

describe("documentHashtags", () => {
  it("#の直後に言葉が続くものだけをタグにする", () => {
    expect(documentHashtags("買う物 #todo と #沖縄 、見出しの # は除く")).toEqual(["todo", "沖縄"]);
  });
});

describe("selectNotes", () => {
  const summaries = [
    note("a", { title: "古いメモ", document: { type: "doc", content: [paragraph("#todo 牛乳")] } }, "2026-11-01T00:00:00Z"),
    note("b", { title: "新しいメモ", notebookIds: ["n1"] }, "2026-11-09T00:00:00Z"),
    note("c", { title: "ピン留め", pinned: true }, "2026-10-01T00:00:00Z"),
    note("d", { title: "捨てたメモ", trashedAt: "2026-11-09T00:00:00Z" }, "2026-11-09T00:00:00Z"),
  ].map(summarizeNote);

  it("すべてのメモはピン留めを先に、新しい順に並べ、ゴミ箱のものは入れない", () => {
    expect(selectNotes(summaries, { kind: "all" }).map((item) => item.note.id)).toEqual(["c", "b", "a"]);
  });

  it("検索はタイトルと本文の両方を見て、空白で区切った語をすべて含むものを返す", () => {
    expect(selectNotes(summaries, { kind: "all" }, "牛乳 todo").map((item) => item.note.id)).toEqual(["a"]);
  });

  it("ノートブック・タグ・ゴミ箱で絞り込める", () => {
    expect(selectNotes(summaries, { kind: "notebook", notebookId: "n1" }).map((item) => item.note.id)).toEqual(["b"]);
    expect(selectNotes(summaries, { kind: "tag", tag: "todo" }).map((item) => item.note.id)).toEqual(["a"]);
    expect(selectNotes(summaries, { kind: "trash" }).map((item) => item.note.id)).toEqual(["d"]);
  });

  it("タグの件数にはゴミ箱のメモを数えない", () => {
    expect(countTags(summaries)).toEqual([{ tag: "todo", count: 1 }]);
  });
});

describe("buildNotebookTree", () => {
  it("親を指すノートブックを子として入れ、親が消えたものは最上位に出す", () => {
    const notebook = (id: string, name: string, parentId: string | null): LiveNotebook => ({
      id, kind: "notebook", updatedAt: "", updatedBy: "d", removed: false, content: { name, parentId, createdAt: "" },
    });
    const tree = buildNotebookTree([notebook("w", "仕事", null), notebook("m", "議事録", "w"), notebook("o", "旅行", "gone")]);
    expect(tree.map((node) => [node.notebook.content.name, node.children.map((child) => child.notebook.content.name)])).toEqual([
      ["仕事", ["議事録"]],
      ["旅行", []],
    ]);
  });
});

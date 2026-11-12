import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { appendParagraph } from "./bodyFixtures";
import { bodyPlainText, plainTextHashtags } from "./bodyText";
import { noteContentFixture } from "./noteFixtures";
import type { LiveNote, LiveNotebook } from "./noteRecords";
import { buildNotebookTree, countTags, selectNotes, summarizeNote } from "./noteQueries";
import { DEFAULT_DATABASE_VIEW } from "./databaseView";

function bodyWith(...paragraphs: string[]): Y.XmlFragment {
  const body = new Y.Doc().getXmlFragment("body");
  paragraphs.forEach((text) => appendParagraph(body, text));
  return body;
}

function note(id: string, overrides: Partial<LiveNote["content"]>, updatedAt: string, body = bodyWith()): LiveNote {
  return {
    id, kind: "note", updatedAt, revision: 0, body,
    content: noteContentFixture({ createdAt: updatedAt, ...overrides }),
  };
}

describe("bodyPlainText", () => {
  it("段落ごとに改行を入れて本文の文字を取り出す", () => {
    expect(bodyPlainText(bodyWith("一行目", "二行目"))).toBe("一行目\n二行目");
  });
});

describe("plainTextHashtags", () => {
  it("#の直後に言葉が続くものだけをタグにする", () => {
    expect(plainTextHashtags("買う物 #todo と #沖縄 、見出しの # は除く")).toEqual(["todo", "沖縄"]);
  });
});

describe("selectNotes", () => {
  const summaries = [
    note("a", { title: "古いメモ" }, "2026-11-01T00:00:00Z", bodyWith("#todo 牛乳")),
    note("b", { title: "新しいメモ", notebookIds: ["n1"] }, "2026-11-09T00:00:00Z"),
    note("c", { title: "ピン留め", pinned: true }, "2026-10-01T00:00:00Z"),
    note("d", { title: "捨てたメモ", trashedAt: "2026-11-09T00:00:00Z" }, "2026-11-09T00:00:00Z"),
  ].map(summarizeNote);

  it("すべてのメモはピン留めを先に、新しい順に並べ、ゴミ箱のものは入れない", () => {
    expect(selectNotes(summaries, { view: { kind: "all" } }).map((item) => item.note.id)).toEqual(["c", "b", "a"]);
  });

  it("検索はタイトルと本文の両方を見て、空白で区切った語をすべて含むものを返す", () => {
    expect(selectNotes(summaries, { view: { kind: "all" }, searchText: "牛乳 todo" }).map((item) => item.note.id)).toEqual(["a"]);
  });

  it("ノートブック・タグ・ゴミ箱で絞り込める", () => {
    expect(selectNotes(summaries, { view: { kind: "notebook", notebookId: "n1" } }).map((item) => item.note.id)).toEqual(["b"]);
    expect(selectNotes(summaries, { view: { kind: "tag", tag: "todo" } }).map((item) => item.note.id)).toEqual(["a"]);
    expect(selectNotes(summaries, { view: { kind: "trash" } }).map((item) => item.note.id)).toEqual(["d"]);
  });

  it("タグの件数にはゴミ箱のメモを数えない", () => {
    expect(countTags(summaries)).toEqual([{ tag: "todo", count: 1 }]);
  });
});

describe("テンプレート", () => {
  const summaries = [
    note("plain", { title: "ふつうのメモ" }, "2026-11-01T00:00:00Z", bodyWith("#todo")),
    note("template", { title: "議事録の型", isTemplate: true, notebookIds: ["n1"] }, "2026-11-02T00:00:00Z", bodyWith("#型")),
  ].map(summarizeNote);

  it("テンプレートは「テンプレート」にだけ並び、ほかの一覧・ノートブック・タグには出ない", () => {
    expect(selectNotes(summaries, { view: { kind: "templates" } }).map((item) => item.note.id)).toEqual(["template"]);
    expect(selectNotes(summaries, { view: { kind: "all" } }).map((item) => item.note.id)).toEqual(["plain"]);
    expect(selectNotes(summaries, { view: { kind: "notebook", notebookId: "n1" } })).toEqual([]);
    expect(countTags(summaries)).toEqual([{ tag: "todo", count: 1 }]);
  });
});

describe("selectNotes の並び順", () => {
  const created = (id: string, title: string, createdAt: string, updatedAt: string) => {
    const made = note(id, { title }, updatedAt);
    return summarizeNote({ ...made, content: { ...made.content, createdAt } });
  };
  const summaries = [
    created("old-edited", "メモ10", "2026-01-01T00:00:00Z", "2026-11-09T00:00:00Z"),
    created("new-untouched", "メモ2", "2026-11-05T00:00:00Z", "2026-11-05T00:00:00Z"),
    summarizeNote(note("pinned", { title: "ん", pinned: true }, "2025-01-01T00:00:00Z")),
  ];
  const idsSortedBy = (sortOrder: "updatedAt" | "createdAt" | "title") =>
    selectNotes(summaries, { view: { kind: "all" }, sortOrder }).map((item) => item.note.id);

  it("作成日の順では、新しく作ったメモを先に並べる", () => {
    expect(idsSortedBy("createdAt")).toEqual(["pinned", "new-untouched", "old-edited"]);
  });

  it("タイトルの順では、数字を大きさで比べて並べる", () => {
    // 「メモ2」（new-untouched）が「メモ10」（old-edited）より前。
    expect(idsSortedBy("title")).toEqual(["pinned", "new-untouched", "old-edited"]);
  });

  it("どの並び順でも、ピン留めしたメモを先に並べる", () => {
    expect(idsSortedBy("updatedAt")).toEqual(["pinned", "old-edited", "new-untouched"]);
  });
});

describe("buildNotebookTree", () => {
  it("親を指すノートブックを子として入れ、親が消えたものは最上位に出す", () => {
    const notebook = (id: string, name: string, parentId: string | null): LiveNotebook => ({
      id, kind: "notebook", updatedAt: "", revision: 0, content: { name, parentId, colorName: null, isLocked: false, iconName: null, properties: [], databaseView: DEFAULT_DATABASE_VIEW, createdAt: "" },
    });
    const tree = buildNotebookTree([notebook("w", "仕事", null), notebook("m", "議事録", "w"), notebook("o", "旅行", "gone")]);
    expect(tree.map((node) => [node.notebook.content.name, node.children.map((child) => child.notebook.content.name)])).toEqual([
      ["仕事", ["議事録"]],
      ["旅行", []],
    ]);
  });
});

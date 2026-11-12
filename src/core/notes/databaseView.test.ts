import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { boardColumns, boardGroupProperty, sortNotesForDatabase } from "./databaseView";
import type { PropertyDefinition, PropertyValue } from "./noteProperties";
import type { LiveNote } from "./noteRecords";

function note(title: string, propertyValues: Record<string, PropertyValue> = {}, updatedAt = "2026-11-12T00:00:00.000Z"): LiveNote {
  return {
    id: title, kind: "note", updatedAt, revision: 0, body: new Y.Doc().getXmlFragment("body"),
    content: { title, notebookIds: [], pinned: false, bookmarked: false, trashedAt: null, isTemplate: false, attachments: [], propertyValues, createdAt: updatedAt },
  };
}

const status: PropertyDefinition = { id: "status", name: "状態", type: "select", options: ["未読", "読了"], order: 1 };
const titles = (notes: LiveNote[]) => notes.map((candidate) => candidate.content.title);

describe("データベース表示", () => {
  it("数のプロパティは数の大小で並び、値の無いメモは昇順でも降順でも最後に来る", () => {
    const notes = [note("a", { pages: 90 }), note("b"), note("c", { pages: 512 }), note("d", { pages: 100 })];
    expect(titles(sortNotesForDatabase(notes, { sortBy: "pages", sortDirection: "ascending" }))).toEqual(["a", "d", "c", "b"]);
    expect(titles(sortNotesForDatabase(notes, { sortBy: "pages", sortDirection: "descending" }))).toEqual(["c", "d", "a", "b"]);
  });

  it("ボードは選択肢の順に列を作り、値の無いメモと、選択肢に無い値のメモを「未設定」の列に入れる", () => {
    const columns = boardColumns([note("読んだ", { status: "読了" }), note("まだ", { status: "未読" }), note("なし"), note("古い値", { status: "積読" })], status);
    expect(columns.map((column) => [column.option, titles(column.notes)])).toEqual([["未読", ["まだ"]], ["読了", ["読んだ"]], [null, ["なし", "古い値"]]]);
  });

  it("ボードの列を分けるプロパティは、選んだものが無ければ最初の選択肢のプロパティになる", () => {
    const pages: PropertyDefinition = { id: "pages", name: "ページ数", type: "number", options: [], order: 0 };
    expect(boardGroupProperty([pages, status], "gone")?.id).toBe("status");
    expect(boardGroupProperty([pages], null)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_DATABASE_VIEW } from "../../core/notes/databaseView";
import type { LiveNotebook } from "../../core/notes/noteRecords";
import { notebookTreeRows } from "./notebookTreeRows";

function notebook(id: string, name: string, parentId: string | null = null): LiveNotebook {
  return {
    id, kind: "notebook", updatedAt: "", revision: 0,
    content: { name, parentId, colorName: null, iconName: null, properties: [], databaseView: DEFAULT_DATABASE_VIEW, createdAt: "" },
  };
}

const notebooks = [
  notebook("travel", "旅行"),
  notebook("work", "仕事"),
  notebook("meetings", "会議", "work"),
  notebook("minutes", "Weekly 議事録", "meetings"),
  notebook("ideas", "アイデア", "work"),
];

const rowsAsText = (searchText: string) => notebookTreeRows(notebooks, searchText)
  .map((row) => `${"  ".repeat(row.depth)}${row.notebook.content.name}${row.matchesSearch ? "" : "（親）"}`);

describe("ノートブックを選ぶダイアログの行", () => {
  it("絞り込まなければ、親の下に子を字下げして、同じ階層は名前の順に並べる", () => {
    expect(rowsAsText("")).toEqual(["仕事", "  アイデア", "  会議", "    Weekly 議事録", "旅行"]);
  });

  it("子だけが名前に当たると、当たらない親も、どこの中のものか分かるように残す", () => {
    expect(rowsAsText("議事録")).toEqual(["仕事（親）", "  会議（親）", "    Weekly 議事録"]);
  });

  it("空白で区切った言葉が全部入っている名前に当たり、大文字と小文字は区別しない", () => {
    expect(rowsAsText("weekly 議事")).toEqual(["仕事（親）", "  会議（親）", "    Weekly 議事録"]);
    expect(rowsAsText("weekly 旅行")).toEqual([]);
  });

  it("親が名前に当たっても、当たらない子は出さない", () => {
    expect(rowsAsText("仕事")).toEqual(["仕事"]);
  });
});

import { describe, expect, it } from "vitest";
import { matchesNoteSearch, parseNoteSearchQuery, type SearchableNote } from "./noteSearchQuery";

const notebookNames = new Map([["work", "仕事"], ["trip", "旅行 計画"]]);
const nameOf = (notebookId: string) => notebookNames.get(notebookId);

function note(overrides: Partial<SearchableNote>): SearchableNote {
  return { title: "", plainText: "", tags: [], notebookIds: [], ...overrides };
}

describe("メモ全体の検索の言葉", () => {
  it("#タグ・notebook:・引用符を、言葉と分けて読む", () => {
    expect(parseNoteSearchQuery('会議 #ToDo notebook:仕事 "次の 予定" ノートブック:"旅行 計画" tag:沖縄')).toEqual({
      words: ["会議", "次の 予定"], tags: ["todo", "沖縄"], notebookNames: ["仕事", "旅行 計画"],
    });
  });

  it("言葉は題か本文に、タグはタグに、ノートブックは名前の一部に当たったメモだけを残す", () => {
    const meeting = note({ title: "会議の記録", plainText: "予算の話", tags: ["todo"], notebookIds: ["work"] });
    const matches = (text: string) => matchesNoteSearch(meeting, parseNoteSearchQuery(text), nameOf);
    expect(matches("予算 #todo notebook:仕事")).toBe(true);
    expect(matches("予算 #沖縄")).toBe(false);
    expect(matches("notebook:旅行")).toBe(false);
    expect(matches("notebook:仕")).toBe(true);
  });
});

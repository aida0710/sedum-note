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

  it("全角と半角、大文字と小文字を区別せずに当たる（言葉・タグ・ノートブックの名前）", () => {
    const note = { title: "型番ＡＢＣ－１２３", plainText: "旅行ｶﾞｲﾄﾞを読む", tags: ["ＴＯＤＯ"], notebookIds: ["n1"] };
    const notebookNameOf = (notebookId: string) => (notebookId === "n1" ? "仕事Ｗｏｒｋ" : undefined);
    expect(matchesNoteSearch(note, parseNoteSearchQuery("abc ガイド"), notebookNameOf)).toBe(true);
    expect(matchesNoteSearch(note, parseNoteSearchQuery("ａｂｃ"), notebookNameOf)).toBe(true);
    expect(matchesNoteSearch(note, parseNoteSearchQuery("#todo"), notebookNameOf)).toBe(true);
    // 絞り込みの印を全角で打っても読む。
    expect(matchesNoteSearch(note, parseNoteSearchQuery("＃ｔｏｄｏ notebook：work"), notebookNameOf)).toBe(true);
    expect(matchesNoteSearch(note, parseNoteSearchQuery("xyz"), notebookNameOf)).toBe(false);
  });
});

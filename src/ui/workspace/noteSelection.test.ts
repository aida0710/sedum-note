import { beforeEach, describe, expect, it } from "vitest";
import { readNoteSelection, resetNoteSelection, selectNoteRange } from "./noteSelection";

const ORDER = ["a", "b", "c", "d", "e"];
const NOTHING_OPEN = { orderedIds: ORDER, openNoteId: null };

describe("左の列のメモの選択", () => {
  beforeEach(() => resetNoteSelection());

  it("Shift で押すと、起点から押したメモまでを並び順で選ぶ（上へも下へも）", () => {
    resetNoteSelection("b");
    selectNoteRange("d", NOTHING_OPEN);
    expect(readNoteSelection().noteIds).toEqual(["b", "c", "d"]);
    selectNoteRange("a", NOTHING_OPEN);
    expect(readNoteSelection().noteIds).toEqual(["a", "b"]);
  });

  it("普通に押すと選択が外れ、押したメモが次の Shift の起点になる", () => {
    resetNoteSelection("a");
    selectNoteRange("b", NOTHING_OPEN);
    resetNoteSelection("c");
    expect(readNoteSelection().noteIds).toEqual([]);
    selectNoteRange("e", NOTHING_OPEN);
    expect(readNoteSelection().noteIds).toEqual(["c", "d", "e"]);
  });

  it("起点がほかの一覧にあるときは、同じ一覧で開いているメモから選ぶ。ほかの一覧で開いているメモからは選ばない", () => {
    resetNoteSelection("x");
    selectNoteRange("d", { orderedIds: ORDER, openNoteId: "b" });
    expect(readNoteSelection().noteIds).toEqual(["b", "c", "d"]);
    resetNoteSelection("x");
    selectNoteRange("d", { orderedIds: ORDER, openNoteId: "y" });
    expect(readNoteSelection().noteIds).toEqual(["d"]);
  });
});

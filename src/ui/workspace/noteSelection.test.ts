import { beforeEach, describe, expect, it } from "vitest";
import { readNoteSelection, resetNoteSelection, selectNoteRange, toggleNoteSelection } from "./noteSelection";

const ORDER = ["a", "b", "c", "d", "e"];
const NOTHING_OPEN = { orderedIds: ORDER, openNoteId: null };

describe("左の列のメモの選択", () => {
  beforeEach(() => resetNoteSelection());

  it("Ctrl で押すと、1 件ずつ足したり外したりできる", () => {
    toggleNoteSelection("b", NOTHING_OPEN);
    toggleNoteSelection("d", NOTHING_OPEN);
    toggleNoteSelection("b", NOTHING_OPEN);
    expect(readNoteSelection().noteIds).toEqual(["d"]);
  });

  it("最初の Ctrl では、同じ一覧で開いているメモも一緒に選ぶ。ほかの一覧で開いているメモは選ばない", () => {
    toggleNoteSelection("d", { orderedIds: ORDER, openNoteId: "b" });
    expect(readNoteSelection().noteIds).toEqual(["b", "d"]);
    resetNoteSelection();
    toggleNoteSelection("d", { orderedIds: ORDER, openNoteId: "x" });
    expect(readNoteSelection().noteIds).toEqual(["d"]);
  });

  it("Shift で押すと、起点から押したメモまでを並び順で選ぶ（上へも下へも）", () => {
    toggleNoteSelection("b", NOTHING_OPEN);
    selectNoteRange("d", NOTHING_OPEN);
    expect(readNoteSelection().noteIds).toEqual(["b", "c", "d"]);
    selectNoteRange("a", NOTHING_OPEN);
    expect(readNoteSelection().noteIds).toEqual(["a", "b"]);
  });

  it("普通に押すと選択が外れ、押したメモが次の Shift の起点になる", () => {
    toggleNoteSelection("a", NOTHING_OPEN);
    resetNoteSelection("c");
    expect(readNoteSelection().noteIds).toEqual([]);
    selectNoteRange("e", NOTHING_OPEN);
    expect(readNoteSelection().noteIds).toEqual(["c", "d", "e"]);
  });

  it("起点がほかの一覧にあるときは、開いているメモから選ぶ", () => {
    resetNoteSelection("x");
    selectNoteRange("d", { orderedIds: ORDER, openNoteId: "b" });
    expect(readNoteSelection().noteIds).toEqual(["b", "c", "d"]);
  });
});

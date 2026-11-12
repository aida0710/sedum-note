import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { DEFAULT_DATABASE_VIEW } from "./databaseView";
import { noteContentFixture } from "./noteFixtures";
import { concealSummary, lockedNoteIds } from "./noteLock";
import { summarizeNote } from "./noteQueries";
import type { LiveNote, LiveNotebook } from "./noteRecords";

const CREATED_AT = "2026-01-01T00:00:00.000Z";

function note(id: string, overrides: Partial<LiveNote["content"]> = {}): LiveNote {
  const body = new Y.Doc().getXmlFragment("body");
  const paragraph = new Y.XmlElement("paragraph");
  paragraph.insert(0, [new Y.XmlText(`本文 #秘密 ${id}`)]);
  body.insert(0, [paragraph]);
  return { id, kind: "note", updatedAt: CREATED_AT, revision: 1, body, content: noteContentFixture({ createdAt: CREATED_AT, title: id, ...overrides }) };
}

function notebook(id: string, overrides: Partial<LiveNotebook["content"]> = {}): LiveNotebook {
  return {
    id, kind: "notebook", updatedAt: CREATED_AT, revision: 1,
    content: { name: id, parentId: null, colorName: null, iconName: null, isLocked: false, properties: [], databaseView: DEFAULT_DATABASE_VIEW, createdAt: CREATED_AT, ...overrides },
  };
}

describe("lockedNoteIds", () => {
  it("ロックしたメモと、ロックしたノートブックの中のメモを挙げる", () => {
    const notes = [note("自分でロック", { isLocked: true }), note("ノートブックでロック", { notebookIds: ["日記"] }), note("ふつう", { notebookIds: ["仕事"] })];
    const locked = lockedNoteIds(notes, [notebook("日記", { isLocked: true }), notebook("仕事")]);
    expect([...locked]).toEqual(["自分でロック", "ノートブックでロック"]);
  });

  it("上の階層のノートブックをロックすると、下の階層のノートブックの中のメモもロックされる", () => {
    const notebooks = [notebook("親", { isLocked: true }), notebook("子", { parentId: "親" }), notebook("孫", { parentId: "子" })];
    expect([...lockedNoteIds([note("孫のメモ", { notebookIds: ["孫"] })], notebooks)]).toEqual(["孫のメモ"]);
  });

  it("ノートブックの親子が輪になっていても止まる", () => {
    const notebooks = [notebook("甲", { parentId: "乙" }), notebook("乙", { parentId: "甲" })];
    expect(lockedNoteIds([note("輪の中", { notebookIds: ["甲"] })], notebooks).size).toBe(0);
  });
});

describe("concealSummary", () => {
  it("本文から読んだ文字・タグ・リンクを抜いて、題だけを残す", () => {
    const summary = summarizeNote(note("日記"));
    expect(summary.tags).toEqual(["秘密"]);
    expect(concealSummary(summary)).toEqual({ note: summary.note, plainText: "", tags: [], linkedNoteIds: [] });
  });
});

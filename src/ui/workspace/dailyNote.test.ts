import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newTestRepository } from "../../core/notes/repositoryFixtures";
import { dailyNoteTitle, findOrCreateDailyNote } from "./dailyNote";

describe("デイリーノート", () => {
  it("題は、その日の日付になる", () => {
    const day = new Date(2026, 10, 2, 9, 30);
    expect(dailyNoteTitle("iso", day, "ja")).toBe("2026-11-02");
    expect(dailyNoteTitle("long", day, "ja")).toBe("2026年11月2日");
  });

  it("その日のメモが無ければ選んだノートブックに作り、あれば同じメモを返す", async () => {
    const { repository } = await newTestRepository();
    const journal = await repository.createNotebook("日記");
    const created = await findOrCreateDailyNote({ repository, title: "2026-11-02", notebookId: journal.id });
    expect(created.content.notebookIds).toEqual([journal.id]);
    const again = await findOrCreateDailyNote({ repository, title: "2026-11-02", notebookId: journal.id });
    expect(again.id).toBe(created.id);
  });

  it("ゴミ箱に入れた同じ題のメモは使わず、新しく作る", async () => {
    const { repository } = await newTestRepository();
    const trashed = await findOrCreateDailyNote({ repository, title: "2026-11-02", notebookId: null });
    await repository.moveNoteToTrash(trashed.id);
    const created = await findOrCreateDailyNote({ repository, title: "2026-11-02", notebookId: null });
    expect(created.id).not.toBe(trashed.id);
  });
});

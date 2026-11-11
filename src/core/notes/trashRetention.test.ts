import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newTestRepository } from "./repositoryFixtures";
import { removeExpiredTrash } from "./trashRetention";

const DAY = 24 * 60 * 60 * 1000;

describe("removeExpiredTrash", () => {
  it("ゴミ箱に入れてから日数がたったメモだけを完全に削除し、ゴミ箱の外のメモと新しいゴミは残す", async () => {
    const clock = { now: new Date("2026-11-01T00:00:00Z") };
    const { repository } = await newTestRepository(() => clock.now);
    const kept = await repository.createNote({ title: "使っているメモ" });
    const oldTrash = await repository.createNote({ title: "古いゴミ" });
    await repository.moveNoteToTrash(oldTrash.id);
    clock.now = new Date(clock.now.getTime() + 25 * DAY);
    const recentTrash = await repository.createNote({ title: "新しいゴミ" });
    await repository.moveNoteToTrash(recentTrash.id);
    clock.now = new Date(clock.now.getTime() + 6 * DAY);

    expect(await removeExpiredTrash(repository, 30, clock.now)).toBe(1);
    expect(repository.notes().map((note) => note.id).sort()).toEqual([kept.id, recentTrash.id].sort());
    expect(await removeExpiredTrash(repository, 30, clock.now)).toBe(0);
  });

  it("ゴミ箱から戻したメモは、古くても消さない", async () => {
    const clock = { now: new Date("2026-11-01T00:00:00Z") };
    const { repository } = await newTestRepository(() => clock.now);
    const note = await repository.createNote({ title: "戻したメモ" });
    await repository.moveNoteToTrash(note.id);
    await repository.restoreNoteFromTrash(note.id);
    clock.now = new Date(clock.now.getTime() + 100 * DAY);
    expect(await removeExpiredTrash(repository, 1, clock.now)).toBe(0);
    expect(repository.note(note.id)).toBeDefined();
  });
});

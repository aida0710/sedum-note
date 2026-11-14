import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newTestRepository } from "./repositoryFixtures";

// ロックの前・画面を離れる前は flush を待つ。flush が返ったら、それまでに始めた書き込みは全部手元に残っていなければならない
// （ロックのあとに読み込み直すと、書き終えていない分は失われる）。
describe("保存を待つ（flush）", () => {
  it("完全に削除している途中で flush を待つと、開き直しても削除したメモは戻らない", async () => {
    const { repository, reopen } = await newTestRepository();
    const note = await repository.createNote({ title: "消すメモ" });
    await repository.moveNoteToTrash(note.id);
    await repository.flush();

    const removing = repository.removeNotePermanently(note.id);
    await repository.flush();

    expect((await reopen()).note(note.id)).toBeUndefined();
    await removing;
  });
});

import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { readField, writeField } from "./recordDocument";
import { newTestRepository } from "./repositoryFixtures";

describe("ノートブックの移動", () => {
  it("別のノートブックの中へ移し、一番上の段へ戻せる。自分の中（自分と、その下のノートブック）へは移せない", async () => {
    const { repository } = await newTestRepository();
    const work = await repository.createNotebook("仕事");
    const minutes = await repository.createNotebook("議事録", work.id);
    const travel = await repository.createNotebook("旅行");
    const parentOf = (id: string) => repository.notebooks().find((notebook) => notebook.id === id)?.content.parentId;

    await repository.moveNotebook(travel.id, minutes.id);
    expect(parentOf(travel.id)).toBe(minutes.id);
    await expect(repository.moveNotebook(work.id, travel.id)).rejects.toThrow("cannot be moved into itself");
    await expect(repository.moveNotebook(work.id, work.id)).rejects.toThrow("cannot be moved into itself");
    expect(parentOf(work.id)).toBeNull();

    await repository.moveNotebook(travel.id, null);
    expect(parentOf(travel.id)).toBeNull();
  });
});

describe("メモの入るノートブック", () => {
  it("メモは 1 つのノートブックにだけ入り、別のノートブックへは移る。null で「未指定」に戻る", async () => {
    const { repository } = await newTestRepository();
    const work = await repository.createNotebook("仕事");
    const travel = await repository.createNotebook("旅行");
    const note = await repository.createNote({ title: "メモ", notebookId: work.id });

    await repository.updateNote(note.id, { notebookId: travel.id });
    expect(repository.note(note.id)!.content.notebookId).toBe(travel.id);
    await repository.updateNote(note.id, { notebookId: null });
    expect(repository.note(note.id)!.content.notebookId).toBeNull();
  });

  it("複数のノートブックに入れられた版で入れたメモは、あとに入れた方の 1 つに入り、移すと残りも外れる", async () => {
    const { repository } = await newTestRepository();
    const work = await repository.createNotebook("仕事");
    const travel = await repository.createNotebook("旅行");
    const note = await repository.createNote({ title: "メモ" });
    // v0.8.3 までの版は、ノートブックごとに「入れている」を書いた。
    await repository.migrateRecords((doc) => {
      if (readField(doc, "kind") === "note") {
        writeField(doc, `notebook:${work.id}`, true, { deviceId: "old", now: new Date("2026-11-01T00:00:00Z") });
        writeField(doc, `notebook:${travel.id}`, true, { deviceId: "old", now: new Date("2026-11-02T00:00:00Z") });
      }
    });
    expect(repository.note(note.id)!.content.notebookId).toBe(travel.id);

    const minutes = await repository.createNotebook("議事録");
    await repository.updateNote(note.id, { notebookId: minutes.id });
    await repository.updateNote(note.id, { notebookId: null });
    expect(repository.note(note.id)!.content.notebookId).toBeNull();
  });

  it("ノートブックを消すと、中のメモは 1 つ上のノートブックへ、一番上の段なら「未指定」へ移る", async () => {
    const { repository } = await newTestRepository();
    const work = await repository.createNotebook("仕事");
    const minutes = await repository.createNotebook("議事録", work.id);
    const inMinutes = await repository.createNote({ title: "週次", notebookId: minutes.id });
    const inWork = await repository.createNote({ title: "予定", notebookId: work.id });

    await repository.removeNotebook(minutes.id);
    expect(repository.note(inMinutes.id)!.content.notebookId).toBe(work.id);
    await repository.removeNotebook(work.id);
    expect(repository.note(inMinutes.id)!.content.notebookId).toBeNull();
    expect(repository.note(inWork.id)!.content.notebookId).toBeNull();
  });
});

import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { importAesKey } from "../crypto/sealedBox";
import { newRandomId } from "../crypto/randomId";
import { IndexedDbLocalStore } from "../local/indexedDbLocalStore";
import { SerialQueue } from "../local/serialQueue";
import { NoteRepository } from "./noteRepository";

async function newRepository(): Promise<NoteRepository> {
  return new NoteRepository({
    localStore: new IndexedDbLocalStore(`repository-${newRandomId()}`),
    masterKey: await importAesKey(crypto.getRandomValues(new Uint8Array(32)), false),
    deviceId: "laptop",
    writeQueue: new SerialQueue(),
    downloadBlob: async () => null,
    conflictCopyTitle: (title) => `${title}（競合コピー）`,
  });
}

describe("NoteRepository.saveEditorChanges", () => {
  it("エディタが読んだときから本文が変わっていなければ、そのまま保存する", async () => {
    const repository = await newRepository();
    const note = await repository.createNote({ title: "メモ", document: { text: "最初" } });
    const outcome = await repository.saveEditorChanges(note.id, { document: { text: "追記" } }, { title: "メモ", document: { text: "最初" } });
    expect(outcome.kind).toBe("saved");
    expect(repository.notes()).toHaveLength(1);
    expect(repository.note(note.id)?.content.document).toEqual({ text: "追記" });
  });

  it("打っている間に同期で本文が変わっていたら、上書きせずに競合コピーにする", async () => {
    const repository = await newRepository();
    const note = await repository.createNote({ title: "メモ", document: { text: "最初" } });
    // 同期で届いたほかのデバイスの編集の代わり。
    await repository.updateNote(note.id, { document: { text: "スマホで追記" } });
    const outcome = await repository.saveEditorChanges(note.id, { document: { text: "PCで追記" } }, { title: "メモ", document: { text: "最初" } });
    expect(outcome.kind).toBe("kept_as_copy");
    expect(repository.note(note.id)?.content.document).toEqual({ text: "スマホで追記" });
    expect(repository.notes().map((item) => [item.content.title, item.content.document])).toContainEqual(["メモ（競合コピー）", { text: "PCで追記" }]);
  });

  it("ピン留めなど本文以外の変更なら、競合にせずに保存する", async () => {
    const repository = await newRepository();
    const note = await repository.createNote({ title: "メモ", document: { text: "最初" } });
    await repository.updateNote(note.id, { pinned: true });
    const outcome = await repository.saveEditorChanges(note.id, { document: { text: "追記" } }, { title: "メモ", document: { text: "最初" } });
    expect(outcome.kind).toBe("saved");
    expect(repository.note(note.id)?.content).toMatchObject({ pinned: true, document: { text: "追記" } });
  });
});

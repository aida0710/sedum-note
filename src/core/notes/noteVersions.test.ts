import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../crypto/randomId";
import { importAesKey } from "../crypto/sealedBox";
import { IndexedDbLocalStore } from "../local/indexedDbLocalStore";
import { SerialQueue } from "../local/serialQueue";
import { appendAttachmentImage, appendParagraph } from "./bodyFixtures";
import { bodyPlainText } from "./bodyText";
import { NoteRepository } from "./noteRepository";
import { EDIT_VERSION_INTERVAL_MILLISECONDS } from "./noteVersions";

const MINUTE = 60_000;

async function repositoryWithClock() {
  const clock = { now: new Date("2026-11-11T09:00:00Z") };
  const localStore = new IndexedDbLocalStore(`versions-${newRandomId()}`);
  const repository = new NoteRepository({
    localStore,
    masterKey: await importAesKey(crypto.getRandomValues(new Uint8Array(32)), false),
    deviceId: newRandomId(),
    writeQueue: new SerialQueue(),
    downloadBlob: async () => null,
    now: () => clock.now,
  });
  await repository.load();
  const advance = (milliseconds: number) => {
    clock.now = new Date(clock.now.getTime() + milliseconds);
  };
  // 本文に 1 行足して、手元に保存する（エディタで打って保存されたのと同じ）。
  const writeLine = async (noteId: string, text: string) => {
    appendParagraph(repository.note(noteId)!.body, text);
    await repository.flush();
  };
  return { repository, localStore, advance, writeLine };
}

describe("メモの履歴", () => {
  it("編集を始める前の状態を残し、間隔が空くまでは増やさない", async () => {
    const { repository, advance, writeLine } = await repositoryWithClock();
    const note = await repository.createNote({ title: "議事録" });
    await writeLine(note.id, "1 行目");
    advance(MINUTE);
    await writeLine(note.id, "2 行目");
    // 作ってすぐの書きかけは残さない。
    expect(await repository.noteVersions(note.id)).toEqual([]);

    advance(EDIT_VERSION_INTERVAL_MILLISECONDS);
    await writeLine(note.id, "3 行目");
    advance(MINUTE);
    await writeLine(note.id, "4 行目");
    expect((await repository.noteVersions(note.id)).map((version) => version.plainText)).toEqual(["1 行目\n2 行目"]);

    advance(EDIT_VERSION_INTERVAL_MILLISECONDS);
    await writeLine(note.id, "5 行目");
    expect((await repository.noteVersions(note.id)).map((version) => [version.reason, version.title, version.plainText])).toEqual([
      ["edit", "議事録", "1 行目\n2 行目\n3 行目\n4 行目"],
      ["edit", "議事録", "1 行目\n2 行目"],
    ]);
  });

  it("タイトルやピン留めだけの変更では残さない", async () => {
    const { repository, advance, writeLine } = await repositoryWithClock();
    const note = await repository.createNote({ title: "メモ" });
    await writeLine(note.id, "本文");
    advance(EDIT_VERSION_INTERVAL_MILLISECONDS);
    await repository.updateNote(note.id, { title: "名前を変えた", pinned: true });
    await repository.flush();
    expect(await repository.noteVersions(note.id)).toEqual([]);
  });

  it("版を別のメモとして復元すると、その版の本文と添付が入り、元のメモは変わらない", async () => {
    const { repository, advance, writeLine } = await repositoryWithClock();
    const notebook = await repository.createNotebook("仕事");
    const note = await repository.createNote({ title: "議事録", notebookIds: [notebook.id] });
    await writeLine(note.id, "消す前の文");
    const photo = await repository.storeAttachment({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png", fileName: "photo.png" });
    appendAttachmentImage(repository.note(note.id)!.body, photo);
    await repository.flush();
    advance(EDIT_VERSION_INTERVAL_MILLISECONDS);
    const body = repository.note(note.id)!.body;
    body.delete(0, body.length);
    await writeLine(note.id, "書き直した文");

    const [version] = await repository.noteVersions(note.id);
    const restored = await repository.restoreVersionAsNewNote({ noteId: note.id, versionId: version!.id, title: "議事録（復元）" });
    expect(restored.id).not.toBe(note.id);
    expect([restored.content.title, restored.content.notebookIds, bodyPlainText(restored.body)]).toEqual(["議事録（復元）", [notebook.id], "消す前の文"]);
    expect(restored.content.attachments.map((attachment) => attachment.id)).toEqual([photo.id]);
    expect(bodyPlainText(repository.note(note.id)!.body)).toBe("書き直した文");

    // 復元したメモが添付を使っている間は、元のメモを完全に削除しても添付は残る。
    await repository.removeNotePermanently(note.id);
    expect(await repository.readAttachment(photo.id)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("メモを完全に削除すると、その履歴も消える", async () => {
    const { repository, localStore, advance, writeLine } = await repositoryWithClock();
    const note = await repository.createNote({ title: "消すメモ" });
    await writeLine(note.id, "1 行目");
    advance(EDIT_VERSION_INTERVAL_MILLISECONDS);
    await writeLine(note.id, "2 行目");
    expect(await localStore.listVersions(note.id)).toHaveLength(1);
    await repository.removeNotePermanently(note.id);
    expect(await localStore.listVersions(note.id)).toEqual([]);
  });
});

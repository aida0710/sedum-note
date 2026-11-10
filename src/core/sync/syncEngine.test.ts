import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../crypto/randomId";
import { IndexedDbLocalStore } from "../local/indexedDbLocalStore";
import { appendAttachmentImage, appendParagraph } from "../notes/bodyFixtures";
import { bodyPlainText } from "../notes/bodyText";
import { MemoryObjectStore } from "../remote/memoryObjectStore";
import type { RemoteConfig } from "../remote/remoteConfig";
import { createNewVault, joinExistingVault, type UnlockedVault, unlockLocalVault, type VaultSessionEnvironment } from "../vault/vaultSession";
import { blobObjectKey, recordObjectKey } from "./remoteLayout";

const PASSPHRASE = "correct horse battery";
const remoteConfig: RemoteConfig = {
  endpoint: "https://s3.example.com", bucket: "notes", region: "auto", prefix: "", accessKeyId: "k", secretAccessKey: "s",
};

function deviceEnvironment(objectStore: MemoryObjectStore): VaultSessionEnvironment {
  return { localStore: new IndexedDbLocalStore(`device-${newRandomId()}`), createObjectStore: () => objectStore };
}

async function twoDevices(): Promise<{ store: MemoryObjectStore; laptop: UnlockedVault; phone: UnlockedVault; phoneEnvironment: VaultSessionEnvironment }> {
  const store = new MemoryObjectStore();
  const laptop = await createNewVault(deviceEnvironment(store), { passphrase: PASSPHRASE, remoteConfig });
  const phoneEnvironment = deviceEnvironment(store);
  const phone = await joinExistingVault(phoneEnvironment, { passphrase: PASSPHRASE, remoteConfig });
  return { store, laptop, phone, phoneEnvironment };
}

const sync = (device: UnlockedVault) => device.syncEngine!.syncOnce();
const bodyOf = (device: UnlockedVault, noteId: string) => bodyPlainText(device.repository.note(noteId)!.body);

describe("SyncEngine", () => {
  it("1 台で書いたメモとノートブックが、もう 1 台に届く", async () => {
    const { laptop, phone } = await twoDevices();
    const notebook = await laptop.repository.createNotebook("旅行");
    const note = await laptop.repository.createNote({ title: "持ち物", notebookIds: [notebook.id] });
    appendParagraph(note.body, "日焼け止め");
    await sync(laptop);
    await sync(phone);
    expect(phone.repository.notes().map((item) => [item.content.title, item.content.notebookIds])).toEqual([["持ち物", [notebook.id]]]);
    expect(bodyOf(phone, note.id)).toBe("日焼け止め");
    expect(phone.repository.notebooks().map((item) => item.content.name)).toEqual(["旅行"]);
  });

  it("同期先にはタイトルもノートブック名も本文も平文で置かない", async () => {
    const { store, laptop } = await twoDevices();
    await laptop.repository.createNotebook("secret-notebook");
    const note = await laptop.repository.createNote({ title: "secret-title" });
    appendParagraph(note.body, "secret-body");
    await sync(laptop);
    const bodies = await Promise.all((await store.list("")).map(async (object) => new TextDecoder("latin1").decode((await store.get(object.key))!.body)));
    expect(bodies.join("\n")).not.toMatch(/secret|paragraph|notebook/);
  });

  it("2 台で同じメモの本文を同時に変えたら、1 つのメモの中で両方の変更が残る", async () => {
    const { laptop, phone } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "議事録" });
    appendParagraph(note.body, "最初の行");
    await sync(laptop);
    await sync(phone);

    appendParagraph(laptop.repository.note(note.id)!.body, "PCで追記");
    appendParagraph(phone.repository.note(note.id)!.body, "スマホで追記");
    await sync(laptop);
    await sync(phone);
    await sync(laptop);

    for (const device of [laptop, phone]) {
      expect(device.repository.notes()).toHaveLength(1);
      const lines = bodyOf(device, note.id).split("\n");
      expect(lines[0]).toBe("最初の行");
      expect(lines.slice(1).sort()).toEqual(["PCで追記", "スマホで追記"]);
    }
    expect(bodyOf(laptop, note.id)).toBe(bodyOf(phone, note.id));
  });

  it("マージのあと何も触らなければ、何度同期しても送り合わない", async () => {
    const { laptop, phone } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "メモ" });
    await sync(laptop);
    await sync(phone);
    appendParagraph(laptop.repository.note(note.id)!.body, "PC");
    appendParagraph(phone.repository.note(note.id)!.body, "スマホ");
    await laptop.repository.updateNote(note.id, { pinned: true });
    await phone.repository.updateNote(note.id, { bookmarked: true });
    await sync(laptop);
    await sync(phone);
    await sync(laptop);
    for (const device of [laptop, phone, laptop, phone]) {
      expect(await sync(device)).toMatchObject({ pushedCount: 0, pulledCount: 0 });
    }
    expect(phone.repository.note(note.id)!.content).toMatchObject({ pinned: true, bookmarked: true });
  });

  it("保存する前の入力を持ったまま取り込んでも、あとで送るときに相手の文字を消さない", async () => {
    const { laptop, phone } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "メモ" });
    await sync(laptop);
    await sync(phone);

    appendParagraph(laptop.repository.note(note.id)!.body, "PCの行");
    await sync(laptop);
    // スマホは打った直後（手元に保存する前）に、同期で PC の行を取り込む。
    appendParagraph(phone.repository.note(note.id)!.body, "スマホの行");
    await sync(phone);
    appendParagraph(phone.repository.note(note.id)!.body, "スマホの続き");
    await sync(phone);
    await sync(laptop);

    expect(bodyOf(laptop, note.id).split("\n").sort()).toEqual(["PCの行", "スマホの行", "スマホの続き"].sort());
    expect(bodyOf(laptop, note.id)).toBe(bodyOf(phone, note.id));
  });

  it("2 台で別々のノートブックに入れたら、両方に入る", async () => {
    const { laptop, phone } = await twoDevices();
    const work = await laptop.repository.createNotebook("仕事");
    const travel = await laptop.repository.createNotebook("旅行");
    const note = await laptop.repository.createNote({ title: "メモ" });
    await sync(laptop);
    await sync(phone);
    await laptop.repository.updateNote(note.id, { notebookIds: [work.id] });
    await phone.repository.updateNote(note.id, { notebookIds: [travel.id] });
    await sync(laptop);
    await sync(phone);
    await sync(laptop);
    expect(laptop.repository.note(note.id)!.content.notebookIds.sort()).toEqual([work.id, travel.id].sort());
  });

  it("完全に削除したメモは、もう 1 台からも消え、同期先の写真も消える", async () => {
    const { store, laptop, phone } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "消すメモ" });
    const photo = await laptop.repository.storeAttachment({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png", fileName: "a.png" });
    appendAttachmentImage(note.body, photo);
    await sync(laptop);
    await sync(phone);
    expect(await store.get(blobObjectKey(photo.id))).not.toBeNull();

    await laptop.repository.removeNotePermanently(note.id);
    await sync(laptop);
    await sync(phone);
    expect(phone.repository.notes()).toEqual([]);
    expect(await store.get(blobObjectKey(photo.id))).toBeNull();
  });

  it("ほかのデバイスで完全に削除されても、送っていない編集があるメモは写真ごと残る", async () => {
    const { store, laptop, phone } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "写真のメモ" });
    const bytes = Uint8Array.from({ length: 5000 }, (_, index) => index % 251);
    const photo = await laptop.repository.storeAttachment({ bytes, mimeType: "image/png", fileName: "a.png" });
    appendAttachmentImage(note.body, photo);
    await sync(laptop);
    await sync(phone);
    expect(await phone.repository.readAttachment(photo.id)).toEqual(bytes);

    await laptop.repository.removeNotePermanently(note.id);
    await sync(laptop);
    appendParagraph(phone.repository.note(note.id)!.body, "オフラインで書き足した");
    await sync(phone);
    await sync(laptop);

    expect(bodyOf(laptop, note.id)).toBe("オフラインで書き足した");
    expect(await store.get(blobObjectKey(photo.id))).not.toBeNull();
    expect(await laptop.repository.readAttachment(photo.id)).toEqual(bytes);
  });

  it("写真は暗号化して送り、もう 1 台で同じバイト列に戻せる", async () => {
    const { laptop, phone } = await twoDevices();
    const bytes = Uint8Array.from({ length: 200_000 }, (_, index) => (index * 31) % 256);
    const note = await laptop.repository.createNote({ title: "写真" });
    appendAttachmentImage(note.body, await laptop.repository.storeAttachment({ bytes, mimeType: "image/jpeg", fileName: "海.jpg" }));
    await sync(laptop);
    await sync(phone);
    const received = phone.repository.notes()[0]!.content.attachments[0]!;
    expect(received).toMatchObject({ mimeType: "image/jpeg", fileName: "海.jpg" });
    expect(await phone.repository.readAttachment(received.id)).toEqual(bytes);
  });

  it("同期先で書き換えられた暗号文は取り込まず、手元のメモはそのまま残す", async () => {
    const { store, laptop, phone } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "元のメモ" });
    await sync(laptop);
    await sync(phone);
    store.replaceBodyForTest(recordObjectKey(note.id), crypto.getRandomValues(new Uint8Array(64)));
    expect((await sync(phone)).unreadableIds).toEqual([note.id]);
    expect(phone.repository.note(note.id)?.content.title).toBe("元のメモ");
  });

  it("ロックし直しても、手元の暗号文と同期先の設定から元に戻る", async () => {
    const { phone, phoneEnvironment } = await twoDevices();
    const note = await phone.repository.createNote({ title: "オフラインで書いた" });
    appendParagraph(note.body, "本文");
    await phone.repository.flush();
    const reopened = await unlockLocalVault(phoneEnvironment, PASSPHRASE);
    expect(reopened.repository.notes().map((item) => item.content.title)).toEqual(["オフラインで書いた"]);
    expect(bodyPlainText(reopened.repository.note(note.id)!.body)).toBe("本文");
    expect(reopened.remoteConfig).toEqual(remoteConfig);
    expect(reopened.repository.unsyncedIds().has(note.id)).toBe(true);
  });
});

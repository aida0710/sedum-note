import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../crypto/randomId";
import { IndexedDbLocalStore } from "../local/indexedDbLocalStore";
import { MemoryObjectStore } from "../remote/memoryObjectStore";
import type { RemoteConfig } from "../remote/remoteConfig";
import { createNewVault, joinExistingVault, type UnlockedVault, unlockLocalVault, type VaultSessionEnvironment } from "../vault/vaultSession";
import { recordObjectKey } from "./remoteLayout";

const PASSPHRASE = "correct horse battery";
const remoteConfig: RemoteConfig = {
  endpoint: "https://s3.example.com", bucket: "notes", region: "auto", prefix: "", accessKeyId: "k", secretAccessKey: "s",
};

function deviceEnvironment(objectStore: MemoryObjectStore): VaultSessionEnvironment {
  return {
    localStore: new IndexedDbLocalStore(`device-${newRandomId()}`),
    createObjectStore: () => objectStore,
    conflictCopyTitle: (title) => `${title}（競合コピー）`,
  };
}

async function twoDevices(): Promise<{ store: MemoryObjectStore; laptop: UnlockedVault; phone: UnlockedVault; phoneEnvironment: VaultSessionEnvironment }> {
  const store = new MemoryObjectStore();
  const laptop = await createNewVault(deviceEnvironment(store), { passphrase: PASSPHRASE, remoteConfig });
  const phoneEnvironment = deviceEnvironment(store);
  const phone = await joinExistingVault(phoneEnvironment, { passphrase: PASSPHRASE, remoteConfig });
  return { store, laptop, phone, phoneEnvironment };
}

async function syncAndReload(device: UnlockedVault): Promise<void> {
  const report = await device.syncEngine!.syncOnce();
  await device.repository.reloadRecords(report.pulledIds);
}

describe("SyncEngine", () => {
  it("1 台で書いたメモとノートブックが、もう 1 台に届く", async () => {
    const { laptop, phone } = await twoDevices();
    const notebook = await laptop.repository.createNotebook("旅行");
    await laptop.repository.createNote({ title: "持ち物", notebookIds: [notebook.id] });
    await syncAndReload(laptop);
    await syncAndReload(phone);
    expect(phone.repository.notes().map((note) => note.content.title)).toEqual(["持ち物"]);
    expect(phone.repository.notebooks().map((item) => item.content.name)).toEqual(["旅行"]);
  });

  it("同期先にはタイトルもノートブック名も平文で置かない", async () => {
    const { store, laptop } = await twoDevices();
    await laptop.repository.createNotebook("秘密のノートブック");
    await laptop.repository.createNote({ title: "秘密のタイトル" });
    await syncAndReload(laptop);
    const bodies = await Promise.all((await store.list("")).map(async (object) => new TextDecoder("latin1").decode((await store.get(object.key))!.body)));
    expect(bodies.join("\n")).not.toMatch(/秘密|records|notebook/);
  });

  it("2 台で同じメモの本文を変えたら、どちらの本文も残る", async () => {
    const { laptop, phone } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "議事録", document: { text: "最初" } });
    await syncAndReload(laptop);
    await syncAndReload(phone);

    await laptop.repository.updateNote(note.id, { document: { text: "PCで追記" } });
    await phone.repository.updateNote(note.id, { document: { text: "スマホで追記" } });
    await syncAndReload(laptop);
    const phoneReport = await phone.syncEngine!.syncOnce();
    await phone.repository.reloadRecords(phoneReport.pulledIds);
    await syncAndReload(laptop);

    expect(phoneReport.conflictCopyIds).toHaveLength(1);
    for (const device of [laptop, phone]) {
      const documents = device.repository.notes().map((item) => [item.content.title, item.content.document]);
      expect(documents).toEqual(expect.arrayContaining([
        ["議事録", { text: "PCで追記" }],
        ["議事録（競合コピー）", { text: "スマホで追記" }],
      ]));
    }
  });

  it("完全に削除したメモは、もう 1 台からも消える", async () => {
    const { laptop, phone } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "消すメモ" });
    await syncAndReload(laptop);
    await syncAndReload(phone);
    await laptop.repository.removeNotePermanently(note.id);
    await syncAndReload(laptop);
    await syncAndReload(phone);
    expect(phone.repository.notes()).toEqual([]);
  });

  it("写真は暗号化して送り、もう 1 台で同じバイト列に戻せる", async () => {
    const { laptop, phone } = await twoDevices();
    const photo = Uint8Array.from({ length: 200_000 }, (_, index) => (index * 31) % 256);
    const attachment = await laptop.repository.storeAttachment({ bytes: photo, mimeType: "image/jpeg", fileName: "海.jpg" });
    await laptop.repository.createNote({ title: "写真", attachments: [attachment] });
    await syncAndReload(laptop);
    await syncAndReload(phone);
    const received = phone.repository.notes()[0]!.content.attachments[0]!;
    expect(await phone.repository.readAttachment(received.id)).toEqual(photo);
  });

  it("同期先で書き換えられた暗号文は取り込まず、手元のメモはそのまま残す", async () => {
    const { store, laptop, phone } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "元のメモ" });
    await syncAndReload(laptop);
    await syncAndReload(phone);
    store.replaceBodyForTest(recordObjectKey(note.id), crypto.getRandomValues(new Uint8Array(64)));
    const report = await phone.syncEngine!.syncOnce();
    expect(report.unreadableIds).toEqual([note.id]);
    expect(phone.repository.note(note.id)?.content.title).toBe("元のメモ");
  });

  it("ロックし直しても、手元の暗号文と同期先の設定から元に戻る", async () => {
    const { phone, phoneEnvironment } = await twoDevices();
    await phone.repository.createNote({ title: "オフラインで書いた" });
    const reopened = await unlockLocalVault(phoneEnvironment, PASSPHRASE);
    expect(reopened.repository.notes().map((note) => note.content.title)).toEqual(["オフラインで書いた"]);
    expect(reopened.remoteConfig).toEqual(remoteConfig);
  });
});

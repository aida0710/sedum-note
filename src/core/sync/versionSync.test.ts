import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../crypto/randomId";
import { IndexedDbLocalStore } from "../local/indexedDbLocalStore";
import { appendParagraph } from "../notes/bodyFixtures";
import { EDIT_VERSION_INTERVAL_MILLISECONDS } from "../notes/noteVersions";
import { MAX_VERSIONS_PER_NOTE, VERSION_RETENTION_DAYS } from "../notes/versionRetention";
import { MemoryObjectStore } from "../remote/memoryObjectStore";
import type { RemoteConfig } from "../remote/remoteConfig";
import type { UnlockedVault, VaultSessionEnvironment } from "../vault/vaultSession";
import { createSyncedVault, joinSyncedVault, TEST_KDF_COST } from "../vault/vaultTestDevices";
import { VERSIONS_PREFIX } from "./remoteLayout";
import { MAX_VERSION_UPLOADS_PER_SYNC, REMOTE_VERSION_SWEEP_INTERVAL_MILLISECONDS } from "./versionSync";

const PASSPHRASE = "correct horse battery";
const DAY = 24 * 60 * 60 * 1000;
const remoteConfig: RemoteConfig = {
  endpoint: "https://s3.example.com", bucket: "notes", region: "auto", prefix: "", accessKeyId: "k", secretAccessKey: "s",
};

// 2 台が同じ同期先と、同じ時計を使う。時計は試験から進める。
async function twoDevices() {
  const store = new MemoryObjectStore();
  const clock = { now: new Date("2026-11-11T09:00:00Z") };
  const environment = (): VaultSessionEnvironment => ({
    localStore: new IndexedDbLocalStore(`device-${newRandomId()}`), createObjectStore: () => store, kdfCost: TEST_KDF_COST, now: () => clock.now,
  });
  const laptop = await createSyncedVault(environment(), { passphrase: PASSPHRASE, remoteConfig });
  const phone = await joinSyncedVault(environment(), { passphrase: PASSPHRASE, remoteConfig });
  const advance = (milliseconds: number) => {
    clock.now = new Date(clock.now.getTime() + milliseconds);
  };
  // 間隔をあけて本文に 1 行足す。足す前の状態が、履歴に 1 つ残る。
  const writeLineAfterInterval = async (device: UnlockedVault, noteId: string, text: string) => {
    advance(EDIT_VERSION_INTERVAL_MILLISECONDS);
    appendParagraph(device.repository.note(noteId)!.body, text);
    await device.repository.flush();
  };
  return { store, laptop, phone, advance, writeLineAfterInterval };
}

const sync = (device: UnlockedVault) => device.syncEngine!.syncOnce();
const remoteVersionCount = async (store: MemoryObjectStore) => (await store.list(VERSIONS_PREFIX)).length;

async function historyTexts(device: UnlockedVault, noteId: string): Promise<string[]> {
  await device.repository.downloadNoteVersions(noteId);
  return (await device.repository.noteVersions(noteId)).filter((version) => version.reason !== "sync").map((version) => version.plainText);
}

describe("履歴の同期", () => {
  it("1 台で残した履歴を、もう 1 台で履歴を開いたときに見られる", async () => {
    const { store, laptop, phone, writeLineAfterInterval } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "議事録" });
    appendParagraph(note.body, "1 行目");
    await laptop.repository.flush();
    await writeLineAfterInterval(laptop, note.id, "2 行目");
    await writeLineAfterInterval(laptop, note.id, "3 行目");
    await sync(laptop);
    await sync(phone);
    expect(await remoteVersionCount(store)).toBe(2);
    expect(await historyTexts(phone, note.id)).toEqual(["1 行目\n2 行目", "1 行目"]);
    // 取ってきた版から、別のメモとして復元できる。
    const version = (await phone.repository.noteVersions(note.id)).find((candidate) => candidate.plainText === "1 行目")!;
    const restored = await phone.repository.restoreVersionAsNewNote({ noteId: note.id, versionId: version.id, title: "復元" });
    expect(restored.body.toString()).toContain("1 行目");
    // もう一度同期しても、取ってきた版を送り直さない。
    await sync(phone);
    expect(await remoteVersionCount(store)).toBe(2);
  });

  it("同期先には、履歴の本文も、残した理由も平文で置かない", async () => {
    const { store, laptop, writeLineAfterInterval } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "secret-title" });
    appendParagraph(note.body, "secret-body");
    await laptop.repository.flush();
    await writeLineAfterInterval(laptop, note.id, "more");
    await sync(laptop);
    const objects = await store.list(VERSIONS_PREFIX);
    expect(objects).toHaveLength(1);
    const body = new TextDecoder("latin1").decode((await store.get(objects[0]!.key))!.body);
    expect(body).not.toMatch(/secret|edit|capturedAt/);
  });

  it("決めた数を超えた履歴は、同期先からも、ほかのデバイスからも消える", async () => {
    const { store, laptop, phone, writeLineAfterInterval } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "長いメモ" });
    appendParagraph(note.body, "0 行目");
    await laptop.repository.flush();
    await writeLineAfterInterval(laptop, note.id, "1 行目");
    await sync(laptop);
    await sync(phone);
    expect(await historyTexts(phone, note.id)).toEqual(["0 行目"]);

    for (let line = 2; line <= MAX_VERSIONS_PER_NOTE + 1; line += 1) {
      await writeLineAfterInterval(laptop, note.id, `${line} 行目`);
    }
    await sync(laptop);
    expect(await remoteVersionCount(store)).toBe(MAX_VERSIONS_PER_NOTE);
    const phoneHistory = await historyTexts(phone, note.id);
    expect(phoneHistory).toHaveLength(MAX_VERSIONS_PER_NOTE);
    expect(phoneHistory).not.toContain("0 行目");
  });

  it("たまった履歴は、1 回の同期では上限までを送り、残りを次の同期で送る", async () => {
    const { store, laptop, writeLineAfterInterval } = await twoDevices();
    const noteCount = MAX_VERSION_UPLOADS_PER_SYNC + 1;
    for (let index = 0; index < noteCount; index += 1) {
      const note = await laptop.repository.createNote({ title: `メモ ${index}` });
      appendParagraph(note.body, "1 行目");
      await laptop.repository.flush();
    }
    for (const note of laptop.repository.notes()) {
      await writeLineAfterInterval(laptop, note.id, "2 行目");
    }
    await sync(laptop);
    expect(await remoteVersionCount(store)).toBe(MAX_VERSION_UPLOADS_PER_SYNC);
    await sync(laptop);
    expect(await remoteVersionCount(store)).toBe(noteCount);
  });

  it("決めた日数より前の履歴は、1 日に 1 回の見直しで同期先から消える", async () => {
    const { store, laptop, advance, writeLineAfterInterval } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "古いメモ" });
    appendParagraph(note.body, "1 行目");
    await laptop.repository.flush();
    await writeLineAfterInterval(laptop, note.id, "2 行目");
    await sync(laptop);
    expect(await remoteVersionCount(store)).toBe(1);

    advance(REMOTE_VERSION_SWEEP_INTERVAL_MILLISECONDS);
    await sync(laptop);
    expect(await remoteVersionCount(store)).toBe(1);
    advance(VERSION_RETENTION_DAYS * DAY);
    await sync(laptop);
    expect(await remoteVersionCount(store)).toBe(0);
    expect(await historyTexts(laptop, note.id)).toEqual([]);
  });

  it("メモを完全に削除すると、そのメモの履歴も同期先から消える", async () => {
    const { store, laptop, writeLineAfterInterval } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "消すメモ" });
    appendParagraph(note.body, "1 行目");
    await laptop.repository.flush();
    await writeLineAfterInterval(laptop, note.id, "2 行目");
    await sync(laptop);
    expect(await remoteVersionCount(store)).toBe(1);
    await laptop.repository.removeNotePermanently(note.id);
    await sync(laptop);
    expect(await remoteVersionCount(store)).toBe(0);
  });
});

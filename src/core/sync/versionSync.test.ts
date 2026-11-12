import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../crypto/randomId";
import { IndexedDbLocalStore } from "../local/indexedDbLocalStore";
import { appendParagraph } from "../notes/bodyFixtures";
import { bodyPlainText } from "../notes/bodyText";
import { EDIT_VERSION_INTERVAL_MILLISECONDS } from "../notes/noteVersions";
import { MAX_VERSIONS_PER_NOTE, VERSION_RETENTION_DAYS } from "../notes/versionRetention";
import { MemoryObjectStore } from "../remote/memoryObjectStore";
import type { RemoteConfig } from "../remote/remoteConfig";
import type { UnlockedVault, VaultSessionEnvironment } from "../vault/vaultSession";
import { createSyncedVault, joinSyncedVault, TEST_KDF_COST } from "../vault/vaultTestDevices";
import { VERSIONS_PREFIX } from "./remoteLayout";
import { MAX_VERSION_UPLOADS_PER_SYNC, REMOTE_VERSION_SWEEP_INTERVAL_MILLISECONDS } from "./versionSync";

const PASSPHRASE = "correct horse battery";
const MINUTE = 60_000;
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
  // あとから同じ同期先に加わるデバイス。
  const joinAnotherDevice = () => joinSyncedVault(environment(), { passphrase: PASSPHRASE, remoteConfig });
  return { store, laptop, phone, advance, writeLineAfterInterval, joinAnotherDevice };
}

const sync = (device: UnlockedVault) => device.syncEngine!.syncOnce();
const remoteVersionCount = async (store: MemoryObjectStore) => (await store.list(VERSIONS_PREFIX)).length;
const uploadedVersionStates = async (device: UnlockedVault) => (await device.localStore.listVersionStates()).filter((version) => version.reason !== "sync");

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
    // もう一度同期しても、取ってきた版を送り直さない。
    await sync(phone);
    expect(await remoteVersionCount(store)).toBe(2);
  });

  it("もう 1 台で取ってきた版にメモを戻すと、戻した中身も「復元の前」の版も、書いた側に届く", async () => {
    const { store, laptop, phone, advance, writeLineAfterInterval } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "議事録" });
    appendParagraph(note.body, "1 行目");
    await laptop.repository.flush();
    await writeLineAfterInterval(laptop, note.id, "2 行目");
    await sync(laptop);
    await sync(phone);
    await phone.repository.downloadNoteVersions(note.id);
    const [version] = await phone.repository.noteVersions(note.id);

    advance(MINUTE);
    await phone.repository.restoreNoteToVersion({ noteId: note.id, versionId: version!.id });
    await sync(phone);
    await sync(laptop);
    expect(await remoteVersionCount(store)).toBe(2);
    expect(bodyPlainText(laptop.repository.note(note.id)!.body)).toBe("1 行目");
    await laptop.repository.downloadNoteVersions(note.id);
    expect((await laptop.repository.noteVersions(note.id)).filter((kept) => kept.reason !== "sync").map((kept) => [kept.reason, kept.plainText])).toEqual([
      ["restore", "1 行目\n2 行目"],
      ["edit", "1 行目"],
    ]);
  });

  it("2 台が同時に、片方は版に戻し、片方は編集しても、マージした結果が両方で同じになる", async () => {
    const { laptop, phone, advance, writeLineAfterInterval } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "議事録" });
    appendParagraph(note.body, "1 行目");
    await laptop.repository.flush();
    await writeLineAfterInterval(laptop, note.id, "2 行目");
    await sync(laptop);
    await sync(phone);
    const [version] = await laptop.repository.noteVersions(note.id);

    advance(MINUTE);
    await laptop.repository.restoreNoteToVersion({ noteId: note.id, versionId: version!.id });
    await phone.repository.updateNote(note.id, { pinned: true });
    appendParagraph(phone.repository.note(note.id)!.body, "スマホで足した行");
    await phone.repository.flush();
    await sync(laptop);
    await sync(phone);
    await sync(laptop);

    const laptopBody = laptop.repository.note(note.id)!.body;
    const phoneBody = phone.repository.note(note.id)!.body;
    expect(phoneBody.toString()).toBe(laptopBody.toString());
    // 戻した中身も、同時に足した行も残る。
    expect(bodyPlainText(phoneBody)).toBe("1 行目\nスマホで足した行");
    expect(laptop.repository.note(note.id)!.content.pinned).toBe(true);
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

  it("同期先の名前には、メモと版の ID と暗号文だけを入れ、残した時刻は入れない", async () => {
    const { store, laptop, writeLineAfterInterval } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "議事録" });
    appendParagraph(note.body, "1 行目");
    await laptop.repository.flush();
    await writeLineAfterInterval(laptop, note.id, "2 行目");
    await sync(laptop);
    const [version] = await uploadedVersionStates(laptop);
    const [object] = await store.list(VERSIONS_PREFIX);
    expect(object!.key).toMatch(new RegExp(`^${VERSIONS_PREFIX}${note.id}/${version!.id}-[0-9a-f]+$`));
    expect(object!.key).not.toContain(String(new Date(version!.capturedAt).getTime()));
  });

  it("送ったあと「送った」と書く前に止まった版は、次の同期で送り直さない", async () => {
    const { store, laptop, writeLineAfterInterval } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "議事録" });
    appendParagraph(note.body, "1 行目");
    await laptop.repository.flush();
    await writeLineAfterInterval(laptop, note.id, "2 行目");
    await sync(laptop);
    const [state] = await uploadedVersionStates(laptop);
    const version = await laptop.localStore.getVersion(state!.id);
    await laptop.localStore.putVersion({ ...version!, uploaded: false });
    await sync(laptop);
    expect(await remoteVersionCount(store)).toBe(1);
  });

  it("前の形の名前（残した時刻を平文で入れたもの）の履歴も読め、1 日に 1 回の見直しで今の形の名前に置き直す", async () => {
    const { store, laptop, phone, advance, writeLineAfterInterval, joinAnotherDevice } = await twoDevices();
    const note = await laptop.repository.createNote({ title: "議事録" });
    appendParagraph(note.body, "1 行目");
    await laptop.repository.flush();
    await writeLineAfterInterval(laptop, note.id, "2 行目");
    await sync(laptop);
    const [version] = await uploadedVersionStates(laptop);
    const [object] = await store.list(VERSIONS_PREFIX);
    const legacyKey = `${VERSIONS_PREFIX}${note.id}/${new Date(version!.capturedAt).getTime()}-${version!.id}`;
    await store.put(legacyKey, (await store.get(object!.key))!.body, { ifAbsent: true });
    await store.delete(object!.key);

    // 送った版を、同期先に無いものとして手元から消さない。
    expect(await historyTexts(laptop, note.id)).toEqual(["1 行目"]);
    advance(REMOTE_VERSION_SWEEP_INTERVAL_MILLISECONDS);
    await sync(phone);
    const keys = (await store.list(VERSIONS_PREFIX)).map((listed) => listed.key);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(new RegExp(`^${VERSIONS_PREFIX}${note.id}/${version!.id}-[0-9a-f]+$`));
    const tablet = await joinAnotherDevice();
    expect(await historyTexts(tablet, note.id)).toEqual(["1 行目"]);
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

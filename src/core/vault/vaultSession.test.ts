import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../crypto/randomId";
import { IndexedDbLocalStore } from "../local/indexedDbLocalStore";
import { AppUpdateRequiredError } from "../notes/bodySchema";
import { MemoryObjectStore } from "../remote/memoryObjectStore";
import type { RemoteConfig } from "../remote/remoteConfig";
import { readRemoteVault, writeRemoteVault } from "./remoteVault";
import { findVaultFolders, inspectSyncTarget, SyncTargetChangedError, SyncTargetIncompleteError } from "./syncTarget";
import { keyWrappingOf, type VaultDocument, WrongPassphraseError, WrongSyncKeyError } from "./vaultDocument";
import {
  changePassphrase,
  connectRemote,
  createNewVault,
  joinExistingVault,
  readVaultState,
  replaceSyncKey,
  summarizeDeviceData,
  unlockLocalVault,
  VaultAlreadyExistsError,
  type VaultSessionEnvironment,
  wipeDeviceData,
} from "./vaultSession";
import { connectSyncedRemote, createLocalVault, createSyncedVault, joinSyncedVault, TEST_SYNC_KEY } from "./vaultTestDevices";

const remoteConfig: RemoteConfig = { endpoint: "https://s3.example.com", bucket: "notes", region: "auto", prefix: "", accessKeyId: "k", secretAccessKey: "s" };

// sameDevice を渡すと、そのデバイスの手元の保存を使う（同じデバイスを、別の版のアプリで開く試験用）。
function environment(store: MemoryObjectStore, sameDevice?: VaultSessionEnvironment): VaultSessionEnvironment {
  return { localStore: sameDevice?.localStore ?? new IndexedDbLocalStore(`vault-${newRandomId()}`), createObjectStore: () => store };
}

describe("本文の形の版", () => {
  const newerApp = (store: MemoryObjectStore): VaultSessionEnvironment => ({ ...environment(store), bodySchemaVersion: 2 });

  it("新しいアプリが同期すると、古いアプリは同期を止めて更新を求める。手元のメモは開けるまま", async () => {
    const store = new MemoryObjectStore();
    const oldEnvironment = environment(store);
    const oldApp = await createSyncedVault(oldEnvironment, { passphrase: "correct horse battery", remoteConfig });
    await oldApp.syncEngine!.syncOnce();

    const updated = await joinSyncedVault(newerApp(store), { passphrase: "correct horse battery", remoteConfig });
    await updated.repository.createNote({ title: "新しい書式を使ったメモ" });
    await updated.syncEngine!.syncOnce();

    await expect(oldApp.syncEngine!.syncOnce()).rejects.toBeInstanceOf(AppUpdateRequiredError);
    expect(oldApp.repository.notes()).toEqual([]);
    await expect(unlockLocalVault(oldEnvironment, "correct horse battery")).resolves.toBeDefined();
  });

  it("新しいアプリで作ったバックアップや手元のデータは、古いアプリでは開かない", async () => {
    const store = new MemoryObjectStore();
    const shared = environment(store);
    await createLocalVault({ ...shared, bodySchemaVersion: 2 }, "correct horse battery");
    await expect(unlockLocalVault(shared, "correct horse battery")).rejects.toBeInstanceOf(AppUpdateRequiredError);
  });

  it("パスフレーズを変えても、引き上げた版は下がらない", async () => {
    const store = new MemoryObjectStore();
    const updatedEnvironment = newerApp(store);
    const updated = await createSyncedVault(updatedEnvironment, { passphrase: "correct horse battery", remoteConfig });
    await updated.syncEngine!.syncOnce();
    await changePassphrase(updatedEnvironment, { current: "correct horse battery", next: "another long passphrase" });
    await expect(unlockLocalVault(environment(store, updatedEnvironment), "another long passphrase")).rejects.toBeInstanceOf(AppUpdateRequiredError);
    const oldEnvironment = environment(store);
    await expect(joinSyncedVault(oldEnvironment, { passphrase: "another long passphrase", remoteConfig })).rejects.toBeInstanceOf(AppUpdateRequiredError);
    // 断った参加は、手元に開けない vault を残さない。
    expect(await readVaultState(oldEnvironment.localStore)).toBe("absent");
  });
});

describe("wipeDeviceData", () => {
  it("入力の直後に消しても、保存待ちの入力が書き戻されず、最初の状態に戻る", async () => {
    const databaseName = `vault-${newRandomId()}`;
    const wiped = { localStore: new IndexedDbLocalStore(databaseName), createObjectStore: () => new MemoryObjectStore() };
    const unlocked = await createLocalVault(wiped, "correct horse battery");
    const note = await unlocked.repository.createNote({ title: "消える前のメモ" });
    expect(await summarizeDeviceData(wiped.localStore)).toEqual({ recordCount: 1, waitingForPushCount: 1, syncConfigured: false });

    // 保存は 0.15 秒後に予約される。その前に消す。
    void unlocked.repository.updateNote(note.id, { title: "消す直前の入力" });
    await wipeDeviceData(wiped.localStore, unlocked);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const reopened = new IndexedDbLocalStore(databaseName);
    expect(await readVaultState(reopened)).toBe("absent");
    expect(await reopened.listRecordEntries()).toEqual([]);
  });

  it("ロック中でも消せる（パスフレーズを忘れたとき）", async () => {
    const databaseName = `vault-${newRandomId()}`;
    const locked = new IndexedDbLocalStore(databaseName);
    await createLocalVault({ localStore: locked, createObjectStore: () => new MemoryObjectStore() }, "correct horse battery");
    await wipeDeviceData(new IndexedDbLocalStore(databaseName), null);
    expect(await readVaultState(new IndexedDbLocalStore(databaseName))).toBe("absent");
  });
});

describe("vaultSession", () => {
  it("同期なしで始めたメモも、あとから同期先を設定すれば、ほかのデバイスに届く", async () => {
    const store = new MemoryObjectStore();
    const laptopEnvironment = environment(store);
    const local = await createLocalVault(laptopEnvironment, "correct horse battery");
    await local.repository.createNote({ title: "オフラインで書いた" });
    const connected = await connectSyncedRemote(laptopEnvironment, local, { passphrase: "correct horse battery", remoteConfig });
    await connected.repository.createNote({ title: "同期してから書いた" });
    await connected.syncEngine!.syncOnce();
    const phone = await joinSyncedVault(environment(store), { passphrase: "the phone has its own", remoteConfig });
    await phone.syncEngine!.syncOnce();
    expect(phone.repository.notes().map((note) => note.content.title).sort()).toEqual(["オフラインで書いた", "同期してから書いた"]);
  });

  it("別の vault が置かれたバケットにはつながない", async () => {
    const store = new MemoryObjectStore();
    await createSyncedVault(environment(store), { passphrase: "correct horse battery", remoteConfig });
    const otherEnvironment = environment(store);
    const other = await createLocalVault(otherEnvironment, "another passphrase");
    await expect(connectSyncedRemote(otherEnvironment, other, { passphrase: "another passphrase", remoteConfig })).rejects.toBeInstanceOf(VaultAlreadyExistsError);
    await expect(createSyncedVault(environment(store), { passphrase: "correct horse battery", remoteConfig })).rejects.toBeInstanceOf(VaultAlreadyExistsError);
  });

  it("条件付きの書き込みを守らないストレージには、作成でも参加でもつながない", async () => {
    const careless = new MemoryObjectStore({ ignoresWriteConditions: true });
    await expect(createSyncedVault(environment(careless), { passphrase: "correct horse battery", remoteConfig }))
      .rejects.toMatchObject({ reason: "conditional_writes_unsupported" });
    expect(await careless.list("")).toEqual([]);
  });
});

describe("パスフレーズと暗号化キー", () => {
  it("同期先の vault.json は暗号化キーで包まれ、パスフレーズでは開かない", async () => {
    const store = new MemoryObjectStore();
    await createSyncedVault(environment(store), { passphrase: "correct horse battery", remoteConfig });
    expect(keyWrappingOf((await readRemoteVault(store))!.document)).toBe("syncKey");
    await expect(joinSyncedVault(environment(store), { passphrase: "the phone has its own", remoteConfig, syncKey: "correct horse battery" }))
      .rejects.toBeInstanceOf(WrongSyncKeyError);
  });

  it("違う暗号化キーでの参加は断られ、手元に何も残さない", async () => {
    const store = new MemoryObjectStore();
    await createSyncedVault(environment(store), { passphrase: "correct horse battery", remoteConfig });
    const phoneEnvironment = environment(store);
    await expect(joinSyncedVault(phoneEnvironment, { passphrase: "the phone has its own", remoteConfig, syncKey: "not-the-shared-key" }))
      .rejects.toBeInstanceOf(WrongSyncKeyError);
    expect(await readVaultState(phoneEnvironment.localStore)).toBe("absent");
  });

  it("デバイスごとにパスフレーズが違ってよく、片方で変えても、どちらも自分のパスフレーズで開いて同期できる", async () => {
    const store = new MemoryObjectStore();
    const laptopEnvironment = environment(store);
    const laptop = await createSyncedVault(laptopEnvironment, { passphrase: "correct horse battery", remoteConfig });
    const phoneEnvironment = environment(store);
    const phone = await joinSyncedVault(phoneEnvironment, { passphrase: "the phone has its own", remoteConfig });
    const remoteBefore = (await readRemoteVault(store))!.etag;

    await changePassphrase(laptopEnvironment, { current: "correct horse battery", next: "a brand new phrase" });
    await laptop.repository.createNote({ title: "変えたあとに書いた" });
    await laptop.syncEngine!.syncOnce();
    await phone.syncEngine!.syncOnce();

    // 同期先は変わらず、スマホの手元の vault も書き換わらない。
    expect((await readRemoteVault(store))!.etag).toBe(remoteBefore);
    await expect(unlockLocalVault(laptopEnvironment, "correct horse battery")).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(unlockLocalVault(laptopEnvironment, "a brand new phrase")).resolves.toBeDefined();
    const reopenedPhone = await unlockLocalVault(phoneEnvironment, "the phone has its own");
    expect(reopenedPhone.repository.notes().map((note) => note.content.title)).toEqual(["変えたあとに書いた"]);
    // 新しく参加するデバイスは、パスフレーズでなく暗号化キーを使う。
    await expect(joinSyncedVault(environment(store), { passphrase: "a third passphrase", remoteConfig })).resolves.toBeDefined();
  });

  it("暗号化キーを生成したときだけ、そのキーを 1 度返す。そのキーでほかのデバイスが参加できる", async () => {
    const store = new MemoryObjectStore();
    const inspected = await inspectSyncTarget(store);
    const created = await createNewVault(environment(store), { passphrase: "correct horse battery", syncTarget: { remoteConfig, inspected, syncKey: null } });
    expect(created.generatedSyncKey).toMatch(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/);
    await expect(joinSyncedVault(environment(store), { passphrase: "the phone has its own", remoteConfig, syncKey: created.generatedSyncKey! })).resolves.toBeDefined();
  });

  it("暗号化キーを作り直すと、古いキーでは参加できず、参加済みのデバイスはそのまま同期できる", async () => {
    const store = new MemoryObjectStore();
    const laptopEnvironment = environment(store);
    const laptop = await createSyncedVault(laptopEnvironment, { passphrase: "correct horse battery", remoteConfig });
    const phone = await joinSyncedVault(environment(store), { passphrase: "the phone has its own", remoteConfig });

    await expect(replaceSyncKey(laptopEnvironment, laptop, { passphrase: "wrong horse battery", syncKey: null })).rejects.toBeInstanceOf(WrongPassphraseError);
    const newKey = await replaceSyncKey(laptopEnvironment, laptop, { passphrase: "correct horse battery", syncKey: null });

    await laptop.repository.createNote({ title: "作り直したあとに書いた" });
    await laptop.syncEngine!.syncOnce();
    await phone.syncEngine!.syncOnce();
    expect(phone.repository.notes()).toHaveLength(1);
    await expect(joinSyncedVault(environment(store), { passphrase: "a third passphrase", remoteConfig, syncKey: TEST_SYNC_KEY })).rejects.toBeInstanceOf(WrongSyncKeyError);
    await expect(joinSyncedVault(environment(store), { passphrase: "a third passphrase", remoteConfig, syncKey: newKey! })).resolves.toBeDefined();
  });

  it("2 台が同時に暗号化キーを作り直したら、後の方は断られ、キーを返さない", async () => {
    const store = new MemoryObjectStore();
    const laptopEnvironment = environment(store);
    const laptop = await createSyncedVault(laptopEnvironment, { passphrase: "correct horse battery", remoteConfig });
    // 作り直しの途中（同期先を読んだあと）に、ほかのデバイスが先に書き換える。
    const racing: VaultSessionEnvironment = {
      ...laptopEnvironment,
      createObjectStore: () => ({
        list: (prefix) => store.list(prefix),
        hasObjectsUnder: (prefix) => store.hasObjectsUnder(prefix),
        listFolders: (prefix, maxCount) => store.listFolders(prefix, maxCount),
        delete: (key) => store.delete(key),
        put: (key, body, condition) => store.put(key, body, condition),
        get: async (key) => {
          const stored = await store.get(key);
          if (stored !== null) {
            await store.put(key, stored.body, { ifMatch: stored.etag });
          }
          return stored;
        },
      }),
    };
    await expect(replaceSyncKey(racing, laptop, { passphrase: "correct horse battery", syncKey: null })).rejects.toBeInstanceOf(SyncTargetChangedError);
    // 先に書いた方のキー（ここでは元のキー）で参加できるまま。
    await expect(joinSyncedVault(environment(store), { passphrase: "a third passphrase", remoteConfig })).resolves.toBeDefined();
  });
});

describe("v0.2 までの同期先（パスフレーズで包んだ vault.json）", () => {
  // v0.2 のアプリが作った同期先を作る: 手元と同じ、パスフレーズで包んだ文書を同期先に置く。
  async function legacyDevice(store: MemoryObjectStore) {
    const deviceEnvironment = environment(store);
    await createLocalVault(deviceEnvironment, "correct horse battery");
    const document = (await deviceEnvironment.localStore.readSetting<VaultDocument>("vault"))!;
    await writeRemoteVault(store, document, { ifAbsent: true });
    const inspected = await inspectSyncTarget(store);
    const unlocked = await unlockLocalVault(deviceEnvironment, "correct horse battery");
    const connected = await connectRemote(deviceEnvironment, unlocked, { syncTarget: { remoteConfig, inspected, syncKey: null }, passphrase: null });
    return { deviceEnvironment, unlocked: connected.unlocked };
  }

  it("そのまま同期を続けられ、新しいデバイスは作ったときのパスフレーズで参加できる", async () => {
    const store = new MemoryObjectStore();
    const { unlocked: laptop } = await legacyDevice(store);
    await laptop.repository.createNote({ title: "v0.2 から使っているメモ" });
    await laptop.syncEngine!.syncOnce();
    expect(await inspectSyncTarget(store)).toMatchObject({ state: "existing", keyWrapping: "passphrase" });

    const phone = await joinSyncedVault(environment(store), { passphrase: "the phone has its own", remoteConfig, syncKey: "correct horse battery" });
    await phone.syncEngine!.syncOnce();
    expect(phone.repository.notes()).toHaveLength(1);
  });

  it("暗号化キーを作ると新しい形になり、参加済みのデバイスはキーを入れずに同期を続けられる", async () => {
    const store = new MemoryObjectStore();
    const { deviceEnvironment, unlocked: laptop } = await legacyDevice(store);
    const phone = await joinSyncedVault(environment(store), { passphrase: "the phone has its own", remoteConfig, syncKey: "correct horse battery" });

    const newKey = await replaceSyncKey(deviceEnvironment, laptop, { passphrase: "correct horse battery", syncKey: null });
    expect(await inspectSyncTarget(store)).toMatchObject({ state: "existing", keyWrapping: "syncKey" });

    await laptop.repository.createNote({ title: "新しい形にしたあとに書いた" });
    await laptop.syncEngine!.syncOnce();
    await phone.syncEngine!.syncOnce();
    expect(phone.repository.notes()).toHaveLength(1);
    await expect(joinSyncedVault(environment(store), { passphrase: "a third passphrase", remoteConfig, syncKey: "correct horse battery" })).rejects.toBeInstanceOf(WrongSyncKeyError);
    await expect(joinSyncedVault(environment(store), { passphrase: "a third passphrase", remoteConfig, syncKey: newKey! })).resolves.toBeDefined();
  });
});

describe("同期先の確認", () => {
  it("空・既存・途中（メモはあるのに vault.json が無い）を見分ける", async () => {
    const store = new MemoryObjectStore();
    expect(await inspectSyncTarget(store)).toEqual({ state: "empty" });
    await createSyncedVault(environment(store), { passphrase: "correct horse battery", remoteConfig });
    expect(await inspectSyncTarget(store)).toMatchObject({ state: "existing", keyWrapping: "syncKey" });

    const orphaned = new MemoryObjectStore();
    await orphaned.put("records/0123456789abcdef0123456789abcdef", new Uint8Array([1]), { ifAbsent: true });
    expect(await inspectSyncTarget(orphaned)).toEqual({ state: "incomplete" });
    const localEnvironment = environment(orphaned);
    const local = await createLocalVault(localEnvironment, "correct horse battery");
    await expect(connectSyncedRemote(localEnvironment, local, { passphrase: "correct horse battery", remoteConfig })).rejects.toBeInstanceOf(SyncTargetIncompleteError);
  });

  it("確かめたあとに同期先が変わっていたら、作成も参加も断り、手元に何も残さない", async () => {
    const store = new MemoryObjectStore();
    const whileEmpty = await inspectSyncTarget(store);
    await createSyncedVault(environment(store), { passphrase: "correct horse battery", remoteConfig });
    const lateEnvironment = environment(store);
    await expect(createNewVault(lateEnvironment, { passphrase: "another passphrase", syncTarget: { remoteConfig, inspected: whileEmpty, syncKey: null } }))
      .rejects.toBeInstanceOf(SyncTargetChangedError);
    expect(await readVaultState(lateEnvironment.localStore)).toBe("absent");

    const beforeReplace = await inspectSyncTarget(store);
    const stored = (await readRemoteVault(store))!;
    await writeRemoteVault(store, stored.document, { ifMatch: stored.etag });
    await expect(joinExistingVault(lateEnvironment, { passphrase: "another passphrase", syncTarget: { remoteConfig, inspected: beforeReplace, syncKey: TEST_SYNC_KEY } }))
      .rejects.toBeInstanceOf(SyncTargetChangedError);
    expect(await readVaultState(lateEnvironment.localStore)).toBe("absent");
  });

  it("バケットの直下とすぐ下のフォルダから、メモの置いてある場所を探す", async () => {
    const bucket = new MemoryObjectStore();
    const inFolder = (folder: string): VaultSessionEnvironment => ({
      localStore: new IndexedDbLocalStore(`vault-${newRandomId()}`),
      createObjectStore: () => ({
        list: (prefix) => bucket.list(`${folder}/${prefix}`),
        hasObjectsUnder: (prefix) => bucket.hasObjectsUnder(`${folder}/${prefix}`),
        listFolders: (prefix, maxCount) => bucket.listFolders(`${folder}/${prefix}`, maxCount),
        get: (key) => bucket.get(`${folder}/${key}`),
        put: (key, body, condition) => bucket.put(`${folder}/${key}`, body, condition),
        delete: (key) => bucket.delete(`${folder}/${key}`),
      }),
    });
    expect(await findVaultFolders(bucket)).toEqual([]);
    await createSyncedVault(inFolder("notes"), { passphrase: "correct horse battery", remoteConfig });
    await createSyncedVault(inFolder("work"), { passphrase: "correct horse battery", remoteConfig });
    // ほかの用途のフォルダと、vault でない vault.json は数えない。
    await bucket.put("photos/a.jpg", new Uint8Array([1]), { ifAbsent: true });
    await bucket.put("other/vault.json", new TextEncoder().encode("{}"), { ifAbsent: true });
    expect(await findVaultFolders(bucket)).toEqual(["notes", "work"]);
  });
});

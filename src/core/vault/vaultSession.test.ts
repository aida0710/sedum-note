import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../crypto/randomId";
import { IndexedDbLocalStore } from "../local/indexedDbLocalStore";
import { AppUpdateRequiredError, DATA_FORMAT_VERSION } from "../format/dataFormat";
import { MemoryObjectStore } from "../remote/memoryObjectStore";
import { type ObjectStore, ObjectStoreError, type StoredObject } from "../remote/objectStore";
import type { RemoteConfig, S3RemoteConfig } from "../remote/remoteConfig";
import { OutdatedSyncTargetError, readRemoteVault, writeRemoteVault } from "./remoteVault";
import { checkSyncTarget, findVaultFolders, inspectSyncTarget, SyncTargetChangedError, SyncTargetIncompleteError } from "./syncTarget";
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
import { connectSyncedRemote, createLocalVault, createSyncedVault, joinSyncedVault, TEST_KDF_COST, TEST_SYNC_KEY } from "./vaultTestDevices";

// 試験の中の「新しいアプリ」が持つ版。今のアプリの版より 1 つ先。
const NEWER_DATA_FORMAT_VERSION = DATA_FORMAT_VERSION + 1;

const remoteConfig: S3RemoteConfig = { endpoint: "https://s3.example.com", bucket: "notes", region: "auto", prefix: "", accessKeyId: "k", secretAccessKey: "s" };
// この試験の同期先は、どれも S3 互換ストレージの設定。
const s3 = (config: RemoteConfig) => config as S3RemoteConfig;

// sameDevice を渡すと、そのデバイスの手元の保存を使う（同じデバイスを、別の版のアプリで開く試験用）。
function environment(store: MemoryObjectStore, sameDevice?: VaultSessionEnvironment): VaultSessionEnvironment {
  return { localStore: sameDevice?.localStore ?? new IndexedDbLocalStore(`vault-${newRandomId()}`), createObjectStore: () => store, kdfCost: TEST_KDF_COST };
}

describe("データの形の版", () => {
  const newerApp = (store: MemoryObjectStore): VaultSessionEnvironment => ({ ...environment(store), dataFormatVersion: NEWER_DATA_FORMAT_VERSION });

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
    await createLocalVault({ ...shared, dataFormatVersion: NEWER_DATA_FORMAT_VERSION }, "correct horse battery");
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

// y-tiptap 3.0.x が文書に書いた、カーソルの位置を移す記録の名前（format/dataFormatMigrations.ts）。
const LEGACY_POSITION_MIGRATIONS = "__tiptap_position_migrations:default";

// 記録を取ってくるたびに onRecordFetched を呼ぶ同期先（取ってくる途中で、ほかのデバイスが何かした状況を作る）。
function storeWatchingRecordFetches(store: MemoryObjectStore, onRecordFetched: () => Promise<void>): ObjectStore {
  return {
    list: (prefix) => store.list(prefix),
    hasObjectsUnder: (prefix) => store.hasObjectsUnder(prefix),
    listFolders: (prefix, maxCount) => store.listFolders(prefix, maxCount),
    get: async (key): Promise<StoredObject | null> => {
      const stored = await store.get(key);
      if (key.startsWith("records/")) {
        await onRecordFetched();
      }
      return stored;
    },
    put: (key, body, condition) => store.put(key, body, condition),
    delete: (key) => store.delete(key),
  };
}

describe("データの形の移し替え", () => {
  it("古い版の手元のデータを開くと、記録を新しい形にしてから版を引き上げる。更新日時と履歴は変わらない", async () => {
    const store = new MemoryObjectStore();
    const olderApp = { ...environment(store), dataFormatVersion: DATA_FORMAT_VERSION - 1 };
    const older = await createLocalVault(olderApp, "correct horse battery");
    const note = await older.repository.createNote({ title: "古い版で書いたメモ" });
    older.repository.note(note.id)!.body.doc!.getMap(LEGACY_POSITION_MIGRATIONS).set("position", "moved");
    await older.repository.flush();
    const updatedAtBefore = older.repository.note(note.id)!.updatedAt;
    const versionCountBefore = (await older.repository.noteVersions(note.id)).length;
    older.repository.release();

    const announced: number[] = [];
    const updatedApp = { ...environment(store, olderApp), announceDataFormat: (version: number) => announced.push(version) };
    const updated = await unlockLocalVault(updatedApp, "correct horse battery");

    const migratedNote = updated.repository.note(note.id)!;
    expect(migratedNote.body.doc!.getMap(LEGACY_POSITION_MIGRATIONS).size).toBe(0);
    expect(migratedNote.content.title).toBe("古い版で書いたメモ");
    expect(migratedNote.updatedAt).toBe(updatedAtBefore);
    expect(await updated.repository.noteVersions(note.id)).toHaveLength(versionCountBefore);
    expect((await updatedApp.localStore.readSetting<VaultDocument>("vault"))!.bodySchema).toBe(DATA_FORMAT_VERSION);
    expect(announced).toEqual([DATA_FORMAT_VERSION]);
    // 書き換えた記録は、手元に保存してある（読み直しても消えている）。
    updated.repository.release();
    const reopened = await unlockLocalVault(environment(store, olderApp), "correct horse battery");
    expect(reopened.repository.note(note.id)!.body.doc!.getMap(LEGACY_POSITION_MIGRATIONS).size).toBe(0);
  });

  it("版の揃った手元のデータを開いても、移し替えは流れず、ほかのウィンドウにも知らせない", async () => {
    const store = new MemoryObjectStore();
    const announced: number[] = [];
    const app = { ...environment(store), announceDataFormat: (version: number) => announced.push(version) };
    await createLocalVault(app, "correct horse battery");
    await unlockLocalVault(app, "correct horse battery");
    expect(announced).toEqual([]);
  });

  it("記録を取ってくる間に、新しい版のアプリが同期先の版を引き上げたら、取ってきた記録を入れずに止まる", async () => {
    const store = new MemoryObjectStore();
    let raiseVersionOnNextFetch = false;
    const watchedStore = storeWatchingRecordFetches(store, async () => {
      if (!raiseVersionOnNextFetch) {
        return;
      }
      raiseVersionOnNextFetch = false;
      // 新しい版のアプリが、版を引き上げてから新しい形の記録を送った状況。
      const stored = (await readRemoteVault(store))!;
      await writeRemoteVault(store, { ...stored.document, bodySchema: NEWER_DATA_FORMAT_VERSION }, { ifMatch: stored.etag });
    });
    const reader = await createSyncedVault({ ...environment(store), createObjectStore: () => watchedStore }, { passphrase: "correct horse battery", remoteConfig });
    await reader.syncEngine!.syncOnce();
    const writer = await joinSyncedVault(environment(store), { passphrase: "correct horse battery", remoteConfig });
    await writer.repository.createNote({ title: "取ってくる途中で届いたメモ" });
    await writer.syncEngine!.syncOnce();

    raiseVersionOnNextFetch = true;
    await expect(reader.syncEngine!.syncOnce()).rejects.toBeInstanceOf(AppUpdateRequiredError);
    expect(reader.repository.notes()).toEqual([]);
  });
});

describe("wipeDeviceData", () => {
  it("入力の直後に消しても、保存待ちの入力が書き戻されず、最初の状態に戻る", async () => {
    const databaseName = `vault-${newRandomId()}`;
    const wiped = { localStore: new IndexedDbLocalStore(databaseName), createObjectStore: () => new MemoryObjectStore(), kdfCost: TEST_KDF_COST };
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
    await createLocalVault({ localStore: locked, createObjectStore: () => new MemoryObjectStore(), kdfCost: TEST_KDF_COST }, "correct horse battery");
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
  async function placeOutdatedVault(store: MemoryObjectStore, deviceEnvironment: VaultSessionEnvironment): Promise<void> {
    const document = (await deviceEnvironment.localStore.readSetting<VaultDocument>("vault"))!;
    await writeRemoteVault(store, document, { ifAbsent: true });
  }

  it("確かめる時点で断り、候補にも数えない。作ったときのパスフレーズでも参加できない", async () => {
    const store = new MemoryObjectStore();
    const creator = environment(store);
    await createLocalVault(creator, "correct horse battery");
    await placeOutdatedVault(store, creator);
    await expect(inspectSyncTarget(store)).rejects.toBeInstanceOf(OutdatedSyncTargetError);
    expect(await findVaultFolders(store)).toEqual([]);
  });

  it("同期していたデバイスは同期を止める。空の同期先へ付け替えると、メモと、手元に無い添付も新しい同期先に届く", async () => {
    const oldStore = new MemoryObjectStore();
    const newStore = new MemoryObjectStore();
    const deviceEnvironment: VaultSessionEnvironment = {
      localStore: new IndexedDbLocalStore(`vault-${newRandomId()}`),
      kdfCost: TEST_KDF_COST,
      createObjectStore: (config) => (s3(config).bucket === "new-notes" ? newStore : oldStore),
    };
    // 新しい形の同期先で使っていたデバイスの同期先が、v0.2 までの形に置き換わった状態を作る。
    const device = await createSyncedVault(deviceEnvironment, { passphrase: "correct horse battery", remoteConfig });
    const note = await device.repository.createNote({ title: "前の同期先に送ったメモ" });
    const photo = Uint8Array.from({ length: 2_000 }, (_, index) => index % 251);
    const attachment = await device.repository.storeAttachment({ bytes: photo, mimeType: "image/png", fileName: "a.png" });
    await device.syncEngine!.syncOnce();
    // ほかのデバイスが貼って、このデバイスではまだ開いていない添付（手元に無い）も、前の同期先にある。
    const otherDevice = await joinSyncedVault({ localStore: new IndexedDbLocalStore(`vault-${newRandomId()}`), createObjectStore: () => oldStore }, { passphrase: "the tablet has its own", remoteConfig });
    const elsewhere = Uint8Array.from({ length: 1_500 }, (_, index) => index % 13);
    const attachedElsewhere = await otherDevice.repository.storeAttachment({ bytes: elsewhere, mimeType: "image/png", fileName: "b.png" });
    await otherDevice.syncEngine!.syncOnce();
    expect(await deviceEnvironment.localStore.getBlob(attachedElsewhere.id)).toBeUndefined();
    await oldStore.delete("vault.json");
    await placeOutdatedVault(oldStore, deviceEnvironment);
    await expect(device.syncEngine!.syncOnce()).rejects.toBeInstanceOf(OutdatedSyncTargetError);

    const moved = await connectSyncedRemote(deviceEnvironment, device, { passphrase: "correct horse battery", remoteConfig: { ...remoteConfig, bucket: "new-notes" } });
    await moved.syncEngine!.syncOnce();
    const other = await joinSyncedVault({ localStore: new IndexedDbLocalStore(`vault-${newRandomId()}`), createObjectStore: () => newStore }, { passphrase: "the phone has its own", remoteConfig });
    await other.syncEngine!.syncOnce();
    expect(other.repository.note(note.id)?.content.title).toBe("前の同期先に送ったメモ");
    expect(await other.repository.readAttachment(attachment.id)).toEqual(photo);
    expect(await other.repository.readAttachment(attachedElsewhere.id)).toEqual(elsewhere);
  });

  it("同じメモを持つほかのデバイスは、付け替えた先へ暗号化キーなしでつなぎ直せ、そのデバイスにしか無いメモも届く", async () => {
    const oldStore = new MemoryObjectStore();
    const newStore = new MemoryObjectStore();
    const moved = { ...remoteConfig, bucket: "new-notes" };
    const deviceIn = (): VaultSessionEnvironment => ({
      localStore: new IndexedDbLocalStore(`vault-${newRandomId()}`),
      kdfCost: TEST_KDF_COST,
      createObjectStore: (config) => (s3(config).bucket === "new-notes" ? newStore : oldStore),
    });
    const laptopEnvironment = deviceIn();
    const laptop = await createSyncedVault(laptopEnvironment, { passphrase: "correct horse battery", remoteConfig });
    const phoneEnvironment = deviceIn();
    const phone = await joinSyncedVault(phoneEnvironment, { passphrase: "the phone has its own", remoteConfig });
    await phone.repository.createNote({ title: "スマホにしか無いメモ" });

    const movedLaptop = await connectSyncedRemote(laptopEnvironment, laptop, { passphrase: "correct horse battery", remoteConfig: moved });
    await movedLaptop.syncEngine!.syncOnce();
    // スマホは、新しい同期先を確かめると同じ vault と分かるので、暗号化キーもパスフレーズも入れずに保存できる。
    const inspected = await inspectSyncTarget(newStore);
    const movedPhone = (await connectRemote(phoneEnvironment, phone, { syncTarget: { remoteConfig: moved, inspected, syncKey: null }, passphrase: null })).unlocked;
    await movedPhone.syncEngine!.syncOnce();
    await movedLaptop.syncEngine!.syncOnce();
    expect(movedLaptop.repository.notes().map((note) => note.content.title)).toEqual(["スマホにしか無いメモ"]);
  });
});

describe("同期先の確認", () => {
  it("空・既存・途中（メモはあるのに vault.json が無い）を見分ける", async () => {
    const store = new MemoryObjectStore();
    expect(await inspectSyncTarget(store)).toEqual({ state: "empty" });
    await createSyncedVault(environment(store), { passphrase: "correct horse battery", remoteConfig });
    expect(await inspectSyncTarget(store)).toMatchObject({ state: "existing" });

    const orphaned = new MemoryObjectStore();
    await orphaned.put("records/0123456789abcdef0123456789abcdef", new Uint8Array([1]), { ifAbsent: true });
    expect(await inspectSyncTarget(orphaned)).toEqual({ state: "incomplete" });
    const localEnvironment = environment(orphaned);
    const local = await createLocalVault(localEnvironment, "correct horse battery");
    await expect(connectSyncedRemote(localEnvironment, local, { passphrase: "correct horse battery", remoteConfig })).rejects.toBeInstanceOf(SyncTargetIncompleteError);
  });

  it("書き込みは届いたのに ETag を読めなかったら、置いた vault.json を消して、同期先を空に戻す", async () => {
    const store = new MemoryObjectStore();
    const hidesEtag: VaultSessionEnvironment = {
      ...environment(store),
      createObjectStore: () => ({
        list: (prefix) => store.list(prefix),
        hasObjectsUnder: (prefix) => store.hasObjectsUnder(prefix),
        listFolders: (prefix, maxCount) => store.listFolders(prefix, maxCount),
        get: (key) => store.get(key),
        delete: (key) => store.delete(key),
        put: async (key, body, condition) => {
          const written = await store.put(key, body, condition);
          if (key === "vault.json") {
            throw new ObjectStoreError("etag_hidden", "the ETag header is not exposed");
          }
          return written;
        },
      }),
    };
    await expect(createSyncedVault(hidesEtag, { passphrase: "correct horse battery", remoteConfig })).rejects.toMatchObject({ reason: "etag_hidden" });
    expect(await inspectSyncTarget(store)).toEqual({ state: "empty" });
    expect(await readVaultState(hidesEtag.localStore)).toBe("absent");
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
      kdfCost: TEST_KDF_COST,
      createObjectStore: () => storeUnder(bucket, folder),
    });
    expect(await findVaultFolders(bucket)).toEqual([]);
    await createSyncedVault(inFolder("notes"), { passphrase: "correct horse battery", remoteConfig });
    await createSyncedVault(inFolder("work"), { passphrase: "correct horse battery", remoteConfig });
    // ほかの用途のフォルダと、vault でない vault.json は数えない。
    await bucket.put("photos/a.jpg", new Uint8Array([1]), { ifAbsent: true });
    await bucket.put("other/vault.json", new TextEncoder().encode("{}"), { ifAbsent: true });
    expect(await findVaultFolders(bucket)).toEqual(["notes", "work"]);
  });

  it("フォルダを入れずに確かめると、1 か所だけ見つかった既存のメモを同期先にする。2 か所以上なら候補として返す", async () => {
    const bucket = new MemoryObjectStore();
    const inBucket = (config: RemoteConfig) => storeUnder(bucket, s3(config).prefix);
    await createSyncedVault({ localStore: new IndexedDbLocalStore(`vault-${newRandomId()}`), createObjectStore: inBucket, kdfCost: TEST_KDF_COST }, { passphrase: "correct horse battery", remoteConfig: { ...remoteConfig, prefix: "notes" } });
    const single = await checkSyncTarget(inBucket, { ...remoteConfig, prefix: "" });
    expect(single).toMatchObject({ foundFolderAutomatically: true, remoteConfig: { prefix: "notes" }, inspected: { state: "existing" } });

    await createSyncedVault({ localStore: new IndexedDbLocalStore(`vault-${newRandomId()}`), createObjectStore: inBucket, kdfCost: TEST_KDF_COST }, { passphrase: "correct horse battery", remoteConfig: { ...remoteConfig, prefix: "work" } });
    const several = await checkSyncTarget(inBucket, { ...remoteConfig, prefix: "" });
    expect(several).toMatchObject({ foundFolderAutomatically: false, inspected: { state: "empty" }, otherVaultFolders: ["notes", "work"] });
    // フォルダを入力して確かめたときは、入れ替えずに、ほかの場所を候補として返す。
    const typed = await checkSyncTarget(inBucket, { ...remoteConfig, prefix: "new-place" });
    expect(typed).toMatchObject({ foundFolderAutomatically: false, remoteConfig: { prefix: "new-place" }, otherVaultFolders: ["notes", "work"] });
  });

  it("アクセスキーがバケットの直下を見られなくても、入力したフォルダは確かめられ、そこに作れる", async () => {
    const bucket = new MemoryObjectStore();
    const scopedToFolder = (config: RemoteConfig) => {
      if (s3(config).prefix === "") {
        const refuse = () => Promise.reject(new ObjectStoreError("forbidden", "the key cannot list the bucket root"));
        return { list: refuse, hasObjectsUnder: refuse, listFolders: refuse, get: refuse, put: refuse, delete: refuse };
      }
      return storeUnder(bucket, s3(config).prefix);
    };
    const checked = await checkSyncTarget(scopedToFolder, { ...remoteConfig, prefix: "mine" });
    expect(checked).toMatchObject({ inspected: { state: "empty" }, otherVaultFolders: [], foundFolderAutomatically: false });
  });
});

// バケットの中の 1 つのフォルダだけを見せる ObjectStore（S3ObjectStore の prefix と同じ働き）。
function storeUnder(bucket: MemoryObjectStore, folder: string): ObjectStore {
  const base = folder === "" ? "" : `${folder}/`;
  return {
    list: async (prefix) => (await bucket.list(base + prefix)).map((object) => ({ ...object, key: object.key.slice(base.length) })),
    hasObjectsUnder: (prefix) => bucket.hasObjectsUnder(base + prefix),
    listFolders: (prefix, maxCount) => bucket.listFolders(base + prefix, maxCount),
    get: (key) => bucket.get(base + key),
    put: (key, body, condition) => bucket.put(base + key, body, condition),
    delete: (key) => bucket.delete(base + key),
  };
}

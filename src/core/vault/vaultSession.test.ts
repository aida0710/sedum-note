import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../crypto/randomId";
import { IndexedDbLocalStore } from "../local/indexedDbLocalStore";
import { MemoryObjectStore } from "../remote/memoryObjectStore";
import type { RemoteConfig } from "../remote/remoteConfig";
import { WrongPassphraseError } from "./vaultDocument";
import {
  changePassphrase,
  connectRemote,
  createNewVault,
  joinExistingVault,
  readVaultState,
  summarizeDeviceData,
  unlockLocalVault,
  VaultAlreadyExistsError,
  type VaultSessionEnvironment,
  wipeDeviceData,
} from "./vaultSession";

const remoteConfig: RemoteConfig = { endpoint: "https://s3.example.com", bucket: "notes", region: "auto", prefix: "", accessKeyId: "k", secretAccessKey: "s" };

function environment(store: MemoryObjectStore): VaultSessionEnvironment {
  return { localStore: new IndexedDbLocalStore(`vault-${newRandomId()}`), createObjectStore: () => store };
}

describe("wipeDeviceData", () => {
  it("入力の直後に消しても、保存待ちの入力が書き戻されず、最初の状態に戻る", async () => {
    const databaseName = `vault-${newRandomId()}`;
    const wiped = { localStore: new IndexedDbLocalStore(databaseName), createObjectStore: () => new MemoryObjectStore() };
    const unlocked = await createNewVault(wiped, { passphrase: "correct horse battery", remoteConfig: null });
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
    await createNewVault({ localStore: locked, createObjectStore: () => new MemoryObjectStore() }, { passphrase: "correct horse battery", remoteConfig: null });
    await wipeDeviceData(new IndexedDbLocalStore(databaseName), null);
    expect(await readVaultState(new IndexedDbLocalStore(databaseName))).toBe("absent");
  });
});

describe("vaultSession", () => {
  it("同期なしで始めたメモも、あとから同期先を設定すれば、ほかのデバイスに届く", async () => {
    const store = new MemoryObjectStore();
    const local = await createNewVault(environment(store), { passphrase: "correct horse battery", remoteConfig: null });
    await local.repository.createNote({ title: "オフラインで書いた" });
    const laptopEnvironment = environment(store);
    const connected = await connectRemote(laptopEnvironment, await createNewVault(laptopEnvironment, { passphrase: "correct horse battery", remoteConfig: null }), remoteConfig);
    await connected.repository.createNote({ title: "同期してから書いた" });
    await connected.syncEngine!.syncOnce();
    const phone = await joinExistingVault(environment(store), { passphrase: "correct horse battery", remoteConfig });
    await phone.syncEngine!.syncOnce();
    expect(phone.repository.notes().map((note) => note.content.title)).toEqual(["同期してから書いた"]);
  });

  it("別の vault が置かれたバケットにはつながない", async () => {
    const store = new MemoryObjectStore();
    await createNewVault(environment(store), { passphrase: "correct horse battery", remoteConfig });
    const otherEnvironment = environment(store);
    const other = await createNewVault(otherEnvironment, { passphrase: "another passphrase", remoteConfig: null });
    await expect(connectRemote(otherEnvironment, other, remoteConfig)).rejects.toBeInstanceOf(VaultAlreadyExistsError);
  });

  it("条件付きの書き込みを守らないストレージには、作成でも参加でもつながない", async () => {
    const careless = new MemoryObjectStore({ ignoresWriteConditions: true });
    await expect(createNewVault(environment(careless), { passphrase: "correct horse battery", remoteConfig }))
      .rejects.toMatchObject({ reason: "conditional_writes_unsupported" });
    await expect(joinExistingVault(environment(careless), { passphrase: "correct horse battery", remoteConfig }))
      .rejects.toMatchObject({ reason: "conditional_writes_unsupported" });
    expect(await careless.list("")).toEqual([]);
  });

  it("パスフレーズを変えたら、このデバイスでもほかのデバイスの参加でも新しいものだけが通る", async () => {
    const store = new MemoryObjectStore();
    const laptopEnvironment = environment(store);
    const laptop = await createNewVault(laptopEnvironment, { passphrase: "correct horse battery", remoteConfig });
    await changePassphrase(laptopEnvironment, laptop, { current: "correct horse battery", next: "a brand new phrase" });
    await expect(unlockLocalVault(laptopEnvironment, "correct horse battery")).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(unlockLocalVault(laptopEnvironment, "a brand new phrase")).resolves.toBeDefined();
    await expect(joinExistingVault(environment(store), { passphrase: "a brand new phrase", remoteConfig })).resolves.toBeDefined();
  });

  it("ほかのデバイスで変えたパスフレーズは、同期のあと、このデバイスのロック解除にも効く", async () => {
    const store = new MemoryObjectStore();
    const laptopEnvironment = environment(store);
    const laptop = await createNewVault(laptopEnvironment, { passphrase: "correct horse battery", remoteConfig });
    const phoneEnvironment = environment(store);
    const phone = await joinExistingVault(phoneEnvironment, { passphrase: "correct horse battery", remoteConfig });
    await changePassphrase(laptopEnvironment, laptop, { current: "correct horse battery", next: "a brand new phrase" });
    await phone.syncEngine!.syncOnce();
    await expect(unlockLocalVault(phoneEnvironment, "correct horse battery")).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(unlockLocalVault(phoneEnvironment, "a brand new phrase")).resolves.toBeDefined();
  });
});

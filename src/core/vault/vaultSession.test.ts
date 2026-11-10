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
  unlockLocalVault,
  VaultAlreadyExistsError,
  type VaultSessionEnvironment,
} from "./vaultSession";

const remoteConfig: RemoteConfig = { endpoint: "https://s3.example.com", bucket: "notes", region: "auto", prefix: "", accessKeyId: "k", secretAccessKey: "s" };

function environment(store: MemoryObjectStore): VaultSessionEnvironment {
  return { localStore: new IndexedDbLocalStore(`vault-${newRandomId()}`), createObjectStore: () => store, conflictCopyTitle: (title) => title };
}

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
    await phone.repository.reloadRecords((await phone.syncEngine!.syncOnce()).pulledIds);
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

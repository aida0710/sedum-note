import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../crypto/randomId";
import { IndexedDbLocalStore } from "../local/indexedDbLocalStore";
import { MemoryObjectStore } from "../remote/memoryObjectStore";
import type { RemoteConfig } from "../remote/remoteConfig";
import { exportSyncSetup, InvalidSyncSetupError, isSyncSetup, openSyncSetup } from "./syncSetupFile";
import { WrongSyncKeyError } from "./vaultDocument";
import { replaceSyncKey, VaultNotFoundError, type VaultSessionEnvironment } from "./vaultSession";
import { createLocalVault, createSyncedVault, joinSyncedVault, TEST_KDF_COST, TEST_SYNC_KEY } from "./vaultTestDevices";

const remoteConfig: RemoteConfig = { endpoint: "https://s3.example.com", bucket: "notes", region: "auto", prefix: "family", accessKeyId: "access-key-id", secretAccessKey: "secret-access-key" };

function environment(store: MemoryObjectStore): VaultSessionEnvironment {
  return { localStore: new IndexedDbLocalStore(`setup-${newRandomId()}`), createObjectStore: () => store, kdfCost: TEST_KDF_COST };
}

describe("同期の設定の文書", () => {
  it("暗号化キーを入力せずに書き出せ、暗号化キーで開くと同期先の設定が出て、そのまま参加できる", async () => {
    const store = new MemoryObjectStore();
    const laptopEnvironment = environment(store);
    const laptop = await createSyncedVault(laptopEnvironment, { passphrase: "correct horse battery", remoteConfig });
    await laptop.repository.createNote({ title: "PC のメモ" });
    await laptop.syncEngine!.syncOnce();

    const setup = await exportSyncSetup(laptopEnvironment, laptop);
    expect(isSyncSetup(setup)).toBe(true);
    const opened = await openSyncSetup(setup, TEST_SYNC_KEY);
    expect(opened).toEqual(remoteConfig);
    const phone = await joinSyncedVault(environment(store), { passphrase: "the phone has its own", remoteConfig: opened });
    await phone.syncEngine!.syncOnce();
    expect(phone.repository.notes()).toHaveLength(1);
  });

  it("文書には、アクセスキーもパスフレーズも平文で入らない。違う暗号化キーでは開かない", async () => {
    const store = new MemoryObjectStore();
    const laptopEnvironment = environment(store);
    const laptop = await createSyncedVault(laptopEnvironment, { passphrase: "correct horse battery", remoteConfig });
    const setup = await exportSyncSetup(laptopEnvironment, laptop);
    for (const secret of [remoteConfig.secretAccessKey, remoteConfig.accessKeyId, remoteConfig.endpoint, remoteConfig.bucket, "correct horse battery", TEST_SYNC_KEY]) {
      expect(setup).not.toContain(secret);
    }
    await expect(openSyncSetup(setup, "not-the-shared-key")).rejects.toBeInstanceOf(WrongSyncKeyError);
    // このデバイスのパスフレーズは、暗号化キーの代わりにならない。
    await expect(openSyncSetup(setup, "correct horse battery")).rejects.toBeInstanceOf(WrongSyncKeyError);
  });

  it("暗号化キーを作り直したあとに書き出した文書は、新しいキーでだけ開く", async () => {
    const store = new MemoryObjectStore();
    const laptopEnvironment = environment(store);
    const laptop = await createSyncedVault(laptopEnvironment, { passphrase: "correct horse battery", remoteConfig });
    const newKey = (await replaceSyncKey(laptopEnvironment, laptop, { passphrase: "correct horse battery", syncKey: null }))!;
    const setup = await exportSyncSetup(laptopEnvironment, laptop);
    await expect(openSyncSetup(setup, TEST_SYNC_KEY)).rejects.toBeInstanceOf(WrongSyncKeyError);
    expect(await openSyncSetup(setup, newKey)).toEqual(remoteConfig);
  });

  it("ほかの vault の文書と設定を組み替えたものは、暗号化キーが合っていても開かない", async () => {
    const ours = new MemoryObjectStore();
    const oursEnvironment = environment(ours);
    const ourSetup = JSON.parse(await exportSyncSetup(oursEnvironment, await createSyncedVault(oursEnvironment, { passphrase: "correct horse battery", remoteConfig }))) as Record<string, unknown>;
    const theirs = new MemoryObjectStore();
    const theirsEnvironment = environment(theirs);
    const theirSetup = JSON.parse(await exportSyncSetup(theirsEnvironment, await createSyncedVault(theirsEnvironment, { passphrase: "another passphrase", remoteConfig }))) as Record<string, unknown>;
    const swapped = JSON.stringify({ ...ourSetup, sealedRemoteConfig: theirSetup.sealedRemoteConfig });
    await expect(openSyncSetup(swapped, TEST_SYNC_KEY)).rejects.toBeInstanceOf(InvalidSyncSetupError);
  });

  it("同期の設定でない文字や、同期を設定していないデバイスでは、分かる形で断る", async () => {
    expect(isSyncSetup("https://example.com/")).toBe(false);
    expect(isSyncSetup(JSON.stringify({ format: "something-else" }))).toBe(false);
    await expect(openSyncSetup("not json", TEST_SYNC_KEY)).rejects.toBeInstanceOf(InvalidSyncSetupError);
    const localEnvironment = environment(new MemoryObjectStore());
    await expect(exportSyncSetup(localEnvironment, await createLocalVault(localEnvironment, "correct horse battery"))).rejects.toBeInstanceOf(VaultNotFoundError);
  });
});

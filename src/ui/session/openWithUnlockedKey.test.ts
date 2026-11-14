import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../../core/crypto/randomId";
import { IndexedDbLocalStore } from "../../core/local/indexedDbLocalStore";
import { MemoryObjectStore } from "../../core/remote/memoryObjectStore";
import type { VaultKey, VaultSessionEnvironment } from "../../core/vault/vaultSession";
import { createLocalVault, TEST_KDF_COST } from "../../core/vault/vaultTestDevices";
import { openWithUnlockedKey } from "./openWithUnlockedKey";
import { forgetUnlockedSpaces } from "./unlockedSpaces";

function newEnvironment(): VaultSessionEnvironment {
  return { localStore: new IndexedDbLocalStore(`vault-${newRandomId()}`), createObjectStore: () => new MemoryObjectStore(), kdfCost: TEST_KDF_COST };
}

// 試験の側で、好きなときにキーを返す（ほかのウィンドウの返事を模す）。
function pendingKey() {
  let answer: (key: VaultKey | null) => void = () => undefined;
  const promise = new Promise<VaultKey | null>((resolve) => {
    answer = resolve;
  });
  return { find: () => promise, answer };
}

describe("ほかのウィンドウのキーで、パスフレーズを聞かずに開く", () => {
  it("同じ vault のキーなら開き、メモを読める", async () => {
    const environment = newEnvironment();
    const unlocked = await createLocalVault(environment, "correct horse battery");
    await unlocked.repository.createNote({ title: "ほかのウィンドウのメモ" });

    const opened = await openWithUnlockedKey(environment, async () => unlocked);
    expect(opened?.repository.notes().map((note) => note.content.title)).toEqual(["ほかのウィンドウのメモ"]);
  });

  it("キーの返事を待つ間にロックしたら、届いたキーでは開かない", async () => {
    const environment = newEnvironment();
    const unlocked = await createLocalVault(environment, "correct horse battery");
    const reply = pendingKey();

    const opening = openWithUnlockedKey(environment, reply.find);
    forgetUnlockedSpaces();
    reply.answer(unlocked);

    expect(await opening).toBeNull();
  });

  it("別の vault のキーや、キーが無いときは開かない", async () => {
    const environment = newEnvironment();
    await createLocalVault(environment, "correct horse battery");
    const other = await createLocalVault(newEnvironment(), "correct horse battery");

    expect(await openWithUnlockedKey(environment, async () => other)).toBeNull();
    expect(await openWithUnlockedKey(environment, async () => null)).toBeNull();
  });
});

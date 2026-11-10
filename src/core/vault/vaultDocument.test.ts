import { describe, expect, it } from "vitest";
import { open, seal } from "../crypto/sealedBox";
import {
  changeVaultPassphrase,
  createVault,
  InvalidVaultDocumentError,
  parseVaultDocument,
  serializeVaultDocument,
  unlockVault,
  WeakPassphraseError,
  WrongPassphraseError,
} from "./vaultDocument";

// 試験では導出を軽くする。形式は製品と同じ。
const TEST_COST = { iterations: 1, memoryKiB: 64, parallelism: 1 };

describe("vaultDocument", () => {
  it("作ったときのパスフレーズで、同じマスターキーが取り出せる", async () => {
    const { document, masterKey } = await createVault("correct horse battery", TEST_COST);
    const sealed = await seal(masterKey, new Uint8Array([42]), "x");
    const reopened = await unlockVault(parseVaultDocument(serializeVaultDocument(document)), "correct horse battery");
    expect(await open(reopened, sealed, "x")).toEqual(new Uint8Array([42]));
  });

  it("違うパスフレーズでは WrongPassphraseError になる", async () => {
    const { document } = await createVault("correct horse battery", TEST_COST);
    await expect(unlockVault(document, "wrong horse battery")).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it("短すぎるパスフレーズでは作れない", async () => {
    await expect(createVault("short", TEST_COST)).rejects.toBeInstanceOf(WeakPassphraseError);
  });

  it("パスフレーズを変えても、前に暗号化したものを新しいパスフレーズで開ける", async () => {
    const { document, masterKey } = await createVault("correct horse battery", TEST_COST);
    const sealed = await seal(masterKey, new Uint8Array([9]), "x");
    const changed = await changeVaultPassphrase(document, "correct horse battery", "a brand new phrase");
    await expect(unlockVault(changed, "correct horse battery")).rejects.toBeInstanceOf(WrongPassphraseError);
    expect(await open(await unlockVault(changed, "a brand new phrase"), sealed, "x")).toEqual(new Uint8Array([9]));
  });

  it("極端に重い導出を求める vault.json は読まない", async () => {
    const { document } = await createVault("correct horse battery", TEST_COST);
    const hostile = { ...document, kdf: { ...document.kdf, memoryKiB: 8 * 1024 * 1024 } };
    expect(() => parseVaultDocument(JSON.stringify(hostile))).toThrow(InvalidVaultDocumentError);
  });
});

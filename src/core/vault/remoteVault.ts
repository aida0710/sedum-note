// 同期先の vault.json の読み書き。

import type { ObjectStore, WriteCondition } from "../remote/objectStore";
import { VAULT_OBJECT_KEY } from "../sync/remoteLayout";
import { keyWrappingOf, parseVaultDocument, serializeVaultDocument, type VaultDocument } from "./vaultDocument";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type StoredVaultDocument = { document: VaultDocument; etag: string };

// v0.2 までのアプリが作った同期先（vault.json をパスフレーズで包んである）。暗号化キーが無いので使えない。
export class OutdatedSyncTargetError extends Error {
  constructor() {
    super("the storage holds a vault made by version 0.2 or earlier, which has no encryption key");
    this.name = "OutdatedSyncTargetError";
  }
}

// 無ければ null。形が違えば InvalidVaultDocumentError、v0.2 までの形なら OutdatedSyncTargetError。
export async function readRemoteVault(objectStore: ObjectStore): Promise<StoredVaultDocument | null> {
  const stored = await objectStore.get(VAULT_OBJECT_KEY);
  if (stored === null) {
    return null;
  }
  const document = parseVaultDocument(textDecoder.decode(stored.body));
  if (keyWrappingOf(document) !== "syncKey") {
    throw new OutdatedSyncTargetError();
  }
  return { document, etag: stored.etag };
}

export async function writeRemoteVault(objectStore: ObjectStore, document: VaultDocument, condition: WriteCondition): Promise<void> {
  await objectStore.put(VAULT_OBJECT_KEY, textEncoder.encode(serializeVaultDocument(document)), condition);
}

// 同期先の vault.json の読み書き。

import type { ObjectStore, WriteCondition } from "../remote/objectStore";
import { VAULT_OBJECT_KEY } from "../sync/remoteLayout";
import { parseVaultDocument, serializeVaultDocument, type VaultDocument } from "./vaultDocument";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type StoredVaultDocument = { document: VaultDocument; etag: string };

// 無ければ null。形が違えば InvalidVaultDocumentError。
export async function readRemoteVault(objectStore: ObjectStore): Promise<StoredVaultDocument | null> {
  const stored = await objectStore.get(VAULT_OBJECT_KEY);
  return stored === null ? null : { document: parseVaultDocument(textDecoder.decode(stored.body)), etag: stored.etag };
}

export async function writeRemoteVault(objectStore: ObjectStore, document: VaultDocument, condition: WriteCondition): Promise<void> {
  await objectStore.put(VAULT_OBJECT_KEY, textEncoder.encode(serializeVaultDocument(document)), condition);
}

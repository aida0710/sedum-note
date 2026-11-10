// 同期先が条件付き PUT（If-None-Match・If-Match）を守るかを、つなぐ前に確かめる。
//
// 守らないストレージでは、2 台が同じメモを書いたときに後の書き込みが黙って前のものを
// 消し、vault.json も上書きされる。そういう同期先には最初からつながない。

import { newRandomId } from "../crypto/randomId";
import { type ObjectStore, ObjectStoreError, PreconditionFailedError } from "./objectStore";

const CHECK_PREFIX = "write-check/";
// どのオブジェクトの ETag とも一致しない値（S3 の ETag は 16 進の MD5 など）。
const ETAG_THAT_NEVER_MATCHES = "memo-app-write-check-never-matches";

export async function ensureConditionalWrites(objectStore: ObjectStore): Promise<void> {
  const key = CHECK_PREFIX + newRandomId();
  try {
    await objectStore.put(key, new Uint8Array([1]), { ifAbsent: true });
    const refusesExisting = await isRefused(() => objectStore.put(key, new Uint8Array([2]), { ifAbsent: true }));
    const refusesStaleEtag = await isRefused(() => objectStore.put(key, new Uint8Array([3]), { ifMatch: ETAG_THAT_NEVER_MATCHES }));
    if (!refusesExisting || !refusesStaleEtag) {
      throw new ObjectStoreError("conditional_writes_unsupported", "the storage overwrote an object despite a write condition");
    }
  } finally {
    await objectStore.delete(key).catch(() => undefined);
  }
}

async function isRefused(write: () => Promise<unknown>): Promise<boolean> {
  try {
    await write();
    return false;
  } catch (error) {
    if (error instanceof PreconditionFailedError) {
      return true;
    }
    throw error;
  }
}

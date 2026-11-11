// 同期先（バケットの prefix の下）に置くオブジェクトの名前。
//
//   vault.json       暗号化キーで包んだマスターキー（vault/vaultDocument.ts）。v0.2 までの同期先ではパスフレーズで包んである
//   records/<id>     メモ・ノートブック 1 件の暗号文
//   blobs/<id>       添付（写真など）1 件の暗号文。一度置いたら変えない

import { isRandomId } from "../crypto/randomId";

export const VAULT_OBJECT_KEY = "vault.json";
export const RECORDS_PREFIX = "records/";
export const BLOBS_PREFIX = "blobs/";

export function recordObjectKey(id: string): string {
  return RECORDS_PREFIX + id;
}

export function blobObjectKey(id: string): string {
  return BLOBS_PREFIX + id;
}

// records/ の下で、このアプリが置いた形のキーだけを ID にして返す。
export function recordIdFromObjectKey(key: string): string | null {
  if (!key.startsWith(RECORDS_PREFIX)) {
    return null;
  }
  const id = key.slice(RECORDS_PREFIX.length);
  return isRandomId(id) ? id : null;
}

export function blobBinding(id: string): string {
  return `blob:${id}`;
}

// 同期先（バケットの prefix の下）に置くオブジェクトの名前。
//
//   vault.json       暗号化キーで包んだマスターキー（vault/vaultDocument.ts）。v0.2 までの同期先ではパスフレーズで包んである
//   records/<id>     メモ・ノートブック 1 件の暗号文
//   blobs/<id>       添付（写真など）1 件の暗号文。一度置いたら変えない
//   versions/<記録の id>/<残した時刻>-<版の id>
//                    メモの履歴 1 件の暗号文（notes/versionCodec.ts）。一度置いたら変えない。残した時刻（1970 年からのミリ秒、
//                    13 桁）を名前に入れてあるので、古い履歴は、中身を取ってこずに一覧だけで見分けて消せる

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

export const VERSIONS_PREFIX = "versions/";
const CAPTURE_TIME_DIGITS = 13;

// 同期先にある履歴 1 件。
export type RemoteVersion = { recordId: string; versionId: string; capturedAtMilliseconds: number };

export function versionsPrefixOfRecord(recordId: string): string {
  return `${VERSIONS_PREFIX}${recordId}/`;
}

export function versionObjectKey({ recordId, versionId, capturedAtMilliseconds }: RemoteVersion): string {
  return `${versionsPrefixOfRecord(recordId)}${String(capturedAtMilliseconds).padStart(CAPTURE_TIME_DIGITS, "0")}-${versionId}`;
}

// versions/ の下で、このアプリが置いた形のキーだけを読む。
export function versionFromObjectKey(key: string): RemoteVersion | null {
  if (!key.startsWith(VERSIONS_PREFIX)) {
    return null;
  }
  const [recordId, name, ...rest] = key.slice(VERSIONS_PREFIX.length).split("/");
  const captureTime = name?.slice(0, CAPTURE_TIME_DIGITS) ?? "";
  const versionId = name?.slice(CAPTURE_TIME_DIGITS + 1) ?? "";
  if (rest.length > 0 || recordId === undefined || !isRandomId(recordId) || !/^\d{13}$/.test(captureTime) || name?.[CAPTURE_TIME_DIGITS] !== "-" || !isRandomId(versionId)) {
    return null;
  }
  return { recordId, versionId, capturedAtMilliseconds: Number(captureTime) };
}

export function blobBinding(id: string): string {
  return `blob:${id}`;
}

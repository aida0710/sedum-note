// 同期先に置く、履歴 1 件のオブジェクトの名前を作る・読む。
//
//   versions/<記録の id>/<版の id>-<残した時刻の暗号文>
//
// 古い履歴を、中身を取ってこずに一覧だけで見分けて消せるよう、残した時刻を名前に入れる。時刻はマスターキーで暗号化し、
// 同期先には見せない。暗号文は小文字の 16 進で書く（大文字と小文字を区別しない WebDAV のサーバーでも、名前が重ならない）。
// 暗号文は暗号化するたびに変わるので、同じ版の名前を ID から作り直すことはできない。取ってくる・消すときは、一覧で見た名前を使う。
//
// 前の形の名前 versions/<記録の id>/<残した時刻（1970 年からのミリ秒、13 桁）>-<版の id> も読む。リリースした版は
// この形で置いていないが、開発中の版が置いたものがある。1 日に 1 回の見直しで、今の形に置き直す（versionSync.ts）。

import { bytesToHex, hexToBytes } from "../crypto/hex";
import { isRandomId } from "../crypto/randomId";
import { open, seal, SealedBoxError } from "../crypto/sealedBox";
import { VERSIONS_PREFIX, versionsPrefixOfRecord } from "./remoteLayout";

type VersionIdentity = { recordId: string; versionId: string };
type CapturedVersion = VersionIdentity & { capturedAtMilliseconds: number };

// 同期先にある履歴 1 件。
export type RemoteVersion = CapturedVersion & {
  objectKey: string;
  // 前の形の名前（残した時刻が平文で入っている）か。
  showsCaptureTime: boolean;
};

const LEGACY_CAPTURE_TIME_PATTERN = /^\d{13}$/;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// 時刻の暗号文を、その版の名前に結び付ける。別の版の名前へ写しても開けない。
function captureTimeBinding({ recordId, versionId }: VersionIdentity): string {
  return `version-captured-at:${recordId}:${versionId}`;
}

export async function versionObjectKey(masterKey: CryptoKey, version: CapturedVersion): Promise<string> {
  const sealedCaptureTime = await seal(masterKey, textEncoder.encode(String(version.capturedAtMilliseconds)), captureTimeBinding(version));
  return `${versionsPrefixOfRecord(version.recordId)}${version.versionId}-${bytesToHex(sealedCaptureTime)}`;
}

// versions/ の下で、このアプリが置いた形の名前だけを読む。時刻の暗号文を開けない名前（別のキーのものなど）も null。
export async function readVersionObjectKey(masterKey: CryptoKey, objectKey: string): Promise<RemoteVersion | null> {
  if (!objectKey.startsWith(VERSIONS_PREFIX)) {
    return null;
  }
  const [recordId, name, ...deeper] = objectKey.slice(VERSIONS_PREFIX.length).split("/");
  const [head, tail, ...extra] = name?.split("-") ?? [];
  if (deeper.length > 0 || extra.length > 0 || recordId === undefined || !isRandomId(recordId) || head === undefined || tail === undefined) {
    return null;
  }
  if (isRandomId(head)) {
    const capturedAtMilliseconds = await openCaptureTime(masterKey, { recordId, versionId: head }, tail);
    return capturedAtMilliseconds === null ? null : { recordId, versionId: head, capturedAtMilliseconds, objectKey, showsCaptureTime: false };
  }
  if (LEGACY_CAPTURE_TIME_PATTERN.test(head) && isRandomId(tail)) {
    return { recordId, versionId: tail, capturedAtMilliseconds: Number(head), objectKey, showsCaptureTime: true };
  }
  return null;
}

async function openCaptureTime(masterKey: CryptoKey, version: VersionIdentity, sealedHex: string): Promise<number | null> {
  const sealed = hexToBytes(sealedHex);
  if (sealed === null) {
    return null;
  }
  let captureTime: string;
  try {
    captureTime = textDecoder.decode(await open(masterKey, sealed, captureTimeBinding(version)));
  } catch (error) {
    if (error instanceof SealedBoxError) {
      return null;
    }
    throw error;
  }
  return /^\d+$/.test(captureTime) ? Number(captureTime) : null;
}

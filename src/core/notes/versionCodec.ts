// 同期先に置く、履歴 1 件の暗号文を作る・開く。
//
// 中身は、残した理由と時刻、それに、その時点の記録の暗号文（手元の履歴と同じもの）。理由と時刻も暗号文の中に入れ、
// 同期先には見せない。binding に記録と版の ID を入れるので、別の名前のオブジェクトへ写しても開けない。

import { open, seal } from "../crypto/sealedBox";
import type { LocalVersionEntry } from "../local/localStore";

// sync（ほかのデバイスの変更を取り込む前）の版は、そのデバイスの控えなので同期先には置かない。
type SyncedVersionReason = Exclude<LocalVersionEntry["reason"], "sync">;

const SYNCED_VERSION_REASONS: ReadonlySet<unknown> = new Set<SyncedVersionReason>(["edit", "replace", "restore"]);

export type VersionPayload = {
  reason: SyncedVersionReason;
  // ISO 8601。
  capturedAt: string;
  // 記録と同じ形の暗号文（recordCodec.ts）。
  sealedRecord: Uint8Array;
};

type VersionIdentity = { recordId: string; versionId: string };

// 先頭に、説明（JSON）の長さを 4 バイトで置く。
const HEADER_LENGTH_BYTES = 4;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class InvalidVersionError extends Error {
  constructor() {
    super("the note version is malformed");
    this.name = "InvalidVersionError";
  }
}

function versionBinding({ recordId, versionId }: VersionIdentity): string {
  return `version:${recordId}:${versionId}`;
}

export async function sealVersionPayload(masterKey: CryptoKey, identity: VersionIdentity, payload: VersionPayload): Promise<Uint8Array> {
  const header = textEncoder.encode(JSON.stringify({ reason: payload.reason, capturedAt: payload.capturedAt }));
  const plaintext = new Uint8Array(HEADER_LENGTH_BYTES + header.length + payload.sealedRecord.length);
  new DataView(plaintext.buffer).setUint32(0, header.length);
  plaintext.set(header, HEADER_LENGTH_BYTES);
  plaintext.set(payload.sealedRecord, HEADER_LENGTH_BYTES + header.length);
  return seal(masterKey, plaintext, versionBinding(identity));
}

export async function openVersionPayload(masterKey: CryptoKey, identity: VersionIdentity, sealed: Uint8Array): Promise<VersionPayload> {
  const plaintext = await open(masterKey, sealed, versionBinding(identity));
  if (plaintext.length < HEADER_LENGTH_BYTES) {
    throw new InvalidVersionError();
  }
  const headerLength = new DataView(plaintext.buffer, plaintext.byteOffset, plaintext.byteLength).getUint32(0);
  const headerEnd = HEADER_LENGTH_BYTES + headerLength;
  let header: { reason?: unknown; capturedAt?: unknown };
  try {
    header = JSON.parse(textDecoder.decode(plaintext.subarray(HEADER_LENGTH_BYTES, headerEnd))) as typeof header;
  } catch {
    throw new InvalidVersionError();
  }
  if (headerEnd > plaintext.length || !SYNCED_VERSION_REASONS.has(header.reason) || typeof header.capturedAt !== "string" || Number.isNaN(Date.parse(header.capturedAt))) {
    throw new InvalidVersionError();
  }
  return { reason: header.reason as SyncedVersionReason, capturedAt: header.capturedAt, sealedRecord: plaintext.slice(headerEnd) };
}

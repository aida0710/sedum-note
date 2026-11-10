// 記録を暗号文にする・暗号文から戻す。
//
// 暗号化する前の中身は 2 種類。
//   状態      Yjs の文書のバイナリの状態。JSON に直して作り直すと、マージで本文が二重になるので、
//             保存も同期もこのバイナリのまま扱う
//   削除の印  完全に削除した記録。ほかのデバイスに削除を伝えるため、オブジェクトは消さずにこれを置く
//
// binding に記録の ID を入れるので、S3 の上で別の ID のオブジェクトへ暗号文を写しても開けない。

import { open, seal } from "../crypto/sealedBox";

const STATE_TAG = 1;
const REMOVED_TAG = 2;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type RecordPayload =
  | { kind: "state"; state: Uint8Array }
  // attachmentIds は、消した記録に貼ってあった添付。同期先と手元の添付を消すのに使う。
  | { kind: "removed"; removedAt: string; attachmentIds: string[] };

export class InvalidRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRecordError";
  }
}

export function recordBinding(id: string): string {
  return `record:${id}`;
}

export async function sealRecordPayload(masterKey: CryptoKey, id: string, payload: RecordPayload): Promise<Uint8Array> {
  const body = payload.kind === "state"
    ? payload.state
    : textEncoder.encode(JSON.stringify({ removedAt: payload.removedAt, attachmentIds: payload.attachmentIds }));
  const plaintext = new Uint8Array(1 + body.length);
  plaintext[0] = payload.kind === "state" ? STATE_TAG : REMOVED_TAG;
  plaintext.set(body, 1);
  return seal(masterKey, plaintext, recordBinding(id));
}

export async function openRecordPayload(masterKey: CryptoKey, id: string, sealed: Uint8Array): Promise<RecordPayload> {
  const plaintext = await open(masterKey, sealed, recordBinding(id));
  const body = plaintext.subarray(1);
  if (plaintext[0] === STATE_TAG) {
    return { kind: "state", state: body };
  }
  if (plaintext[0] !== REMOVED_TAG) {
    throw new InvalidRecordError("the record is of an unknown kind");
  }
  let value: unknown;
  try {
    value = JSON.parse(textDecoder.decode(body));
  } catch {
    throw new InvalidRecordError("the removal marker is malformed");
  }
  const marker = value as { removedAt?: unknown; attachmentIds?: unknown };
  if (typeof marker.removedAt !== "string" || !Array.isArray(marker.attachmentIds) ||
    !marker.attachmentIds.every((attachmentId) => typeof attachmentId === "string")) {
    throw new InvalidRecordError("the removal marker is malformed");
  }
  return { kind: "removed", removedAt: marker.removedAt, attachmentIds: marker.attachmentIds as string[] };
}

// 記録を暗号文にする・暗号文から記録に戻す。
//
// binding に記録の ID を入れるので、S3 の上で別の ID のオブジェクトへ暗号文を
// 写しても開けない。開いたあとも、中の ID が置き場所の ID と同じかを確かめる。

import { isRandomId } from "../crypto/randomId";
import { open, seal } from "../crypto/sealedBox";
import type { SyncedRecord } from "./noteRecords";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class InvalidRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRecordError";
  }
}

export function recordBinding(id: string): string {
  return `record:${id}`;
}

export async function sealRecord(masterKey: CryptoKey, record: SyncedRecord): Promise<Uint8Array> {
  return seal(masterKey, textEncoder.encode(JSON.stringify(record)), recordBinding(record.id));
}

export async function openRecord(masterKey: CryptoKey, id: string, sealed: Uint8Array): Promise<SyncedRecord> {
  const plaintext = await open(masterKey, sealed, recordBinding(id));
  const value: unknown = JSON.parse(textDecoder.decode(plaintext));
  const record = checkRecordShape(value);
  if (record.id !== id) {
    throw new InvalidRecordError("the record's id does not match where it was stored");
  }
  return record;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 暗号文は同じキーを持つデバイスしか作れないが、古いバージョンや壊れた書き込みで
// 形が違う記録が混ざっても、画面を落とさずにその 1 件だけを断る。
function checkRecordShape(value: unknown): SyncedRecord {
  if (!isObject(value) || typeof value.id !== "string" || !isRandomId(value.id) ||
    typeof value.updatedAt !== "string" || typeof value.updatedBy !== "string" ||
    typeof value.removed !== "boolean" || (value.kind !== "note" && value.kind !== "notebook")) {
    throw new InvalidRecordError("the record header is malformed");
  }
  if (value.removed) {
    if (value.content !== null) {
      throw new InvalidRecordError("a removed record still has content");
    }
    return value as SyncedRecord;
  }
  const content = value.content;
  if (!isObject(content) || typeof content.createdAt !== "string") {
    throw new InvalidRecordError("the record content is malformed");
  }
  if (value.kind === "note") {
    const valid = typeof content.title === "string" && Array.isArray(content.notebookIds) &&
      content.notebookIds.every((notebookId) => typeof notebookId === "string") &&
      typeof content.pinned === "boolean" && typeof content.bookmarked === "boolean" &&
      (content.trashedAt === null || typeof content.trashedAt === "string") &&
      Array.isArray(content.attachments) && content.attachments.every(isAttachmentReference);
    if (!valid) {
      throw new InvalidRecordError("the note content is malformed");
    }
  } else if (typeof content.name !== "string" || (content.parentId !== null && typeof content.parentId !== "string")) {
    throw new InvalidRecordError("the notebook content is malformed");
  }
  return value as SyncedRecord;
}

function isAttachmentReference(value: unknown): boolean {
  return isObject(value) && typeof value.id === "string" && isRandomId(value.id) &&
    typeof value.mimeType === "string" && typeof value.fileName === "string" &&
    typeof value.byteLength === "number";
}

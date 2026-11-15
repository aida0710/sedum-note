import { describe, expect, it } from "vitest";
import { seal } from "../crypto/sealedBox";
import { openVersionPayload, sealVersionPayload } from "./versionCodec";

const identity = { recordId: "note-1", versionId: "version-1" };
const sealedRecord = new Uint8Array([1, 2, 3]);

async function newMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// v0.8.3 までのアプリや、これより新しいアプリが書く形（説明の JSON を自由に決められる）の版を作る。
async function sealWithHeader(masterKey: CryptoKey, header: object): Promise<Uint8Array> {
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const plaintext = new Uint8Array(4 + headerBytes.length + sealedRecord.length);
  new DataView(plaintext.buffer).setUint32(0, headerBytes.length);
  plaintext.set(headerBytes, 4);
  plaintext.set(sealedRecord, 4 + headerBytes.length);
  return seal(masterKey, plaintext, `version:${identity.recordId}:${identity.versionId}`);
}

describe("同期先に置く履歴の暗号文", () => {
  it("誰が本文を変えたかを、暗号文の中に持って開ける", async () => {
    const masterKey = await newMasterKey();
    const sealed = await sealVersionPayload(masterKey, identity, { reason: "replace", changedBy: "ai", capturedAt: "2026-11-15T01:00:00.000Z", sealedRecord });
    expect(await openVersionPayload(masterKey, identity, sealed)).toEqual({ reason: "replace", changedBy: "ai", capturedAt: "2026-11-15T01:00:00.000Z", sealedRecord });
  });

  it("v0.8.3 までのアプリが書いた、誰が変えたかの無い版も開ける", async () => {
    const masterKey = await newMasterKey();
    const sealed = await sealWithHeader(masterKey, { reason: "replace", capturedAt: "2026-11-15T01:00:00.000Z" });
    expect((await openVersionPayload(masterKey, identity, sealed)).changedBy).toBeUndefined();
  });

  it("知らない値の「誰が変えたか」は、分からないものとして開き、版を捨てない", async () => {
    const masterKey = await newMasterKey();
    const sealed = await sealWithHeader(masterKey, { reason: "replace", changedBy: "robot", capturedAt: "2026-11-15T01:00:00.000Z" });
    const payload = await openVersionPayload(masterKey, identity, sealed);
    expect([payload.reason, payload.changedBy]).toEqual(["replace", undefined]);
  });
});

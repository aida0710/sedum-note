import { describe, expect, it } from "vitest";
import { newRandomId } from "../crypto/randomId";
import { importAesKey } from "../crypto/sealedBox";
import { readVersionObjectKey, versionObjectKey } from "./versionObjectKey";

const newMasterKey = () => importAesKey(crypto.getRandomValues(new Uint8Array(32)), false);
const CAPTURED_AT = Date.parse("2026-11-12T09:00:00Z");

describe("同期先の履歴の名前", () => {
  it("作った名前から、記録と版の ID と残した時刻を読める", async () => {
    const masterKey = await newMasterKey();
    const version = { recordId: newRandomId(), versionId: newRandomId(), capturedAtMilliseconds: CAPTURED_AT };
    const objectKey = await versionObjectKey(masterKey, version);
    expect(await readVersionObjectKey(masterKey, objectKey)).toEqual({ ...version, objectKey, showsCaptureTime: false });
  });

  it("別のキーで作った名前と、時刻の暗号文を別の版の名前へ写したものは読まない", async () => {
    const masterKey = await newMasterKey();
    const recordId = newRandomId();
    const objectKey = await versionObjectKey(masterKey, { recordId, versionId: newRandomId(), capturedAtMilliseconds: CAPTURED_AT });
    expect(await readVersionObjectKey(await newMasterKey(), objectKey)).toBeNull();
    const sealedCaptureTime = objectKey.split("-")[1]!;
    expect(await readVersionObjectKey(masterKey, `versions/${recordId}/${newRandomId()}-${sealedCaptureTime}`)).toBeNull();
  });

  it("前の形の名前は、平文の時刻を読み、その印を付ける", async () => {
    const recordId = newRandomId();
    const versionId = newRandomId();
    const objectKey = `versions/${recordId}/${CAPTURED_AT}-${versionId}`;
    expect(await readVersionObjectKey(await newMasterKey(), objectKey)).toEqual({ recordId, versionId, capturedAtMilliseconds: CAPTURED_AT, objectKey, showsCaptureTime: true });
  });

  it("このアプリが置いた形でない名前は読まない", async () => {
    const masterKey = await newMasterKey();
    const recordId = newRandomId();
    for (const objectKey of [`records/${recordId}`, `versions/${recordId}`, `versions/${recordId}/${newRandomId()}-zz`, `versions/${recordId}/a/${newRandomId()}-00`, "versions/not-an-id/x-y"]) {
      expect(await readVersionObjectKey(masterKey, objectKey)).toBeNull();
    }
  });
});

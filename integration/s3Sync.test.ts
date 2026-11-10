import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../src/core/crypto/randomId";
import { IndexedDbLocalStore } from "../src/core/local/indexedDbLocalStore";
import { PreconditionFailedError } from "../src/core/remote/objectStore";
import { S3ObjectStore } from "../src/core/remote/s3ObjectStore";
import type { RemoteConfig } from "../src/core/remote/remoteConfig";
import { createNewVault, joinExistingVault, VaultAlreadyExistsError, type VaultSessionEnvironment } from "../src/core/vault/vaultSession";
import { newTestRemoteConfig } from "./testStorage";

const PASSPHRASE = "correct horse battery";

function environment(): VaultSessionEnvironment {
  return {
    localStore: new IndexedDbLocalStore(`integration-${newRandomId()}`),
    createObjectStore: (config: RemoteConfig) => new S3ObjectStore(config),
    conflictCopyTitle: (title) => `${title}（競合コピー）`,
  };
}

describe("S3ObjectStore（SeaweedFS）", () => {
  it("新しいキーへの書き込みは 1 回だけ通り、古い ETag での上書きは断られる", async () => {
    const store = new S3ObjectStore(await newTestRemoteConfig());
    const first = await store.put("records/x", new Uint8Array([1]), { ifAbsent: true });
    await expect(store.put("records/x", new Uint8Array([2]), { ifAbsent: true })).rejects.toBeInstanceOf(PreconditionFailedError);
    const second = await store.put("records/x", new Uint8Array([3]), { ifMatch: first.etag });
    await expect(store.put("records/x", new Uint8Array([4]), { ifMatch: first.etag })).rejects.toBeInstanceOf(PreconditionFailedError);
    expect((await store.get("records/x"))?.body).toEqual(new Uint8Array([3]));
    expect(await store.list("records/")).toEqual([{ key: "records/x", etag: second.etag }]);
  });

  it("2 台のデバイスが同じバケットで同期し、競合してもどちらの本文も残る", async () => {
    const remoteConfig = await newTestRemoteConfig();
    const laptop = await createNewVault(environment(), { passphrase: PASSPHRASE, remoteConfig });
    await expect(createNewVault(environment(), { passphrase: PASSPHRASE, remoteConfig })).rejects.toBeInstanceOf(VaultAlreadyExistsError);
    const phone = await joinExistingVault(environment(), { passphrase: PASSPHRASE, remoteConfig });

    const note = await laptop.repository.createNote({ title: "共有メモ", document: { text: "最初" } });
    const photo = Uint8Array.from({ length: 300_000 }, (_, index) => index % 251);
    const attachment = await laptop.repository.storeAttachment({ bytes: photo, mimeType: "image/png", fileName: "a.png" });
    await laptop.repository.updateNote(note.id, { attachments: [attachment] });
    await laptop.syncEngine!.syncOnce();
    await phone.repository.reloadRecords((await phone.syncEngine!.syncOnce()).pulledIds);
    expect(await phone.repository.readAttachment(attachment.id)).toEqual(photo);
    // 変わっていなければ、次の同期では何も取り直さない（一覧の ETag と手元の ETag が揃う）。
    expect(await phone.syncEngine!.syncOnce()).toMatchObject({ pulledIds: [], pushedCount: 0 });

    await laptop.repository.updateNote(note.id, { document: { text: "PC" } });
    await phone.repository.updateNote(note.id, { document: { text: "スマホ" } });
    await laptop.syncEngine!.syncOnce();
    const phoneReport = await phone.syncEngine!.syncOnce();
    await phone.repository.reloadRecords(phoneReport.pulledIds);
    expect(phoneReport.conflictCopyIds).toHaveLength(1);
    expect(phone.repository.notes().map((item) => item.content.document)).toEqual(expect.arrayContaining([{ text: "PC" }, { text: "スマホ" }]));
  });
});

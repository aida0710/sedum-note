import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../src/core/crypto/randomId";
import { IndexedDbLocalStore } from "../src/core/local/indexedDbLocalStore";
import { PreconditionFailedError } from "../src/core/remote/objectStore";
import { S3ObjectStore } from "../src/core/remote/s3ObjectStore";
import type { RemoteConfig } from "../src/core/remote/remoteConfig";
import { findVaultFolders } from "../src/core/vault/syncTarget";
import { VaultAlreadyExistsError, type VaultSessionEnvironment } from "../src/core/vault/vaultSession";
import { createSyncedVault, joinSyncedVault } from "../src/core/vault/vaultTestDevices";
import { appendAttachmentImage, appendParagraph } from "../src/core/notes/bodyFixtures";
import { bodyPlainText } from "../src/core/notes/bodyText";
import { newTestRemoteConfig } from "./testStorage";

const PASSPHRASE = "correct horse battery";

function environment(): VaultSessionEnvironment {
  return {
    localStore: new IndexedDbLocalStore(`integration-${newRandomId()}`),
    createObjectStore: (config: RemoteConfig) => new S3ObjectStore(config),
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

  it("2 台のデバイスが同じバケットで同期し、同時の編集が 1 つのメモにマージされる", async () => {
    const remoteConfig = await newTestRemoteConfig();
    const laptop = await createSyncedVault(environment(), { passphrase: PASSPHRASE, remoteConfig });
    await expect(createSyncedVault(environment(), { passphrase: PASSPHRASE, remoteConfig })).rejects.toBeInstanceOf(VaultAlreadyExistsError);
    // バケットのフォルダを探すと、いま作った場所が見つかる（S3 の delimiter つきの一覧）。
    expect(await findVaultFolders(new S3ObjectStore({ ...remoteConfig, prefix: "" }))).toContain(remoteConfig.prefix);
    const phone = await joinSyncedVault(environment(), { passphrase: PASSPHRASE, remoteConfig });

    const note = await laptop.repository.createNote({ title: "共有メモ" });
    const photo = Uint8Array.from({ length: 300_000 }, (_, index) => index % 251);
    const attachment = await laptop.repository.storeAttachment({ bytes: photo, mimeType: "image/png", fileName: "a.png" });
    appendAttachmentImage(note.body, attachment);
    await laptop.syncEngine!.syncOnce();
    await phone.syncEngine!.syncOnce();
    expect(await phone.repository.readAttachment(attachment.id)).toEqual(photo);
    // 変わっていなければ、次の同期では何も取り直さない（一覧の ETag と手元の ETag が揃う）。
    expect(await phone.syncEngine!.syncOnce()).toMatchObject({ pulledCount: 0, pushedCount: 0 });

    appendParagraph(laptop.repository.note(note.id)!.body, "PC");
    appendParagraph(phone.repository.note(note.id)!.body, "スマホ");
    await laptop.syncEngine!.syncOnce();
    await phone.syncEngine!.syncOnce();
    await laptop.syncEngine!.syncOnce();
    for (const device of [laptop, phone]) {
      expect(device.repository.notes()).toHaveLength(1);
      expect(bodyPlainText(device.repository.note(note.id)!.body).split("\n").sort()).toEqual(["PC", "スマホ"]);
    }
    expect(await laptop.syncEngine!.syncOnce()).toMatchObject({ pulledCount: 0, pushedCount: 0 });
  });
});

import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../src/core/crypto/randomId";
import { IndexedDbLocalStore } from "../src/core/local/indexedDbLocalStore";
import { appendAttachmentImage, appendParagraph } from "../src/core/notes/bodyFixtures";
import { bodyPlainText } from "../src/core/notes/bodyText";
import { EDIT_VERSION_INTERVAL_MILLISECONDS } from "../src/core/notes/noteVersions";
import { ensureConditionalWrites } from "../src/core/remote/conditionalWriteCheck";
import { createObjectStore } from "../src/core/remote/createObjectStore";
import { PreconditionFailedError, sendWithFetch } from "../src/core/remote/objectStore";
import { WebDavObjectStore } from "../src/core/remote/webDavObjectStore";
import type { VaultSessionEnvironment } from "../src/core/vault/vaultSession";
import { createSyncedVault, joinSyncedVault } from "../src/core/vault/vaultTestDevices";
import { newTestWebDavConfig } from "./webDavStorage";

const PASSPHRASE = "correct horse battery";

describe("WebDavObjectStore（本物の WebDAV サーバー）", () => {
  it("条件付きの書き込みを守るので、つなぐ前の確認を通る。新しいキーは 1 回だけ書け、古い ETag での上書きは断られる", async () => {
    const store = new WebDavObjectStore(newTestWebDavConfig());
    await ensureConditionalWrites(store);
    const first = await store.put("records/x", new Uint8Array([1]), { ifAbsent: true });
    await expect(store.put("records/x", new Uint8Array([2]), { ifAbsent: true })).rejects.toBeInstanceOf(PreconditionFailedError);
    await expect(store.put("records/x", new Uint8Array([3]), { ifMatch: "no-such-etag" })).rejects.toBeInstanceOf(PreconditionFailedError);
    expect(await store.list("records/")).toEqual([{ key: "records/x", etag: first.etag }]);
    expect((await store.get("records/x"))?.body).toEqual(new Uint8Array([1]));
  });

  it("2 台のデバイスが同じフォルダで同期し、同時の編集が 1 つのメモにマージされる。履歴も置ける", async () => {
    const remoteConfig = newTestWebDavConfig();
    const clock = { now: new Date() };
    const environment = (): VaultSessionEnvironment => ({
      localStore: new IndexedDbLocalStore(`integration-${newRandomId()}`),
      createObjectStore: (config) => createObjectStore(config, sendWithFetch),
      now: () => clock.now,
    });
    const laptop = await createSyncedVault(environment(), { passphrase: PASSPHRASE, remoteConfig });
    const phone = await joinSyncedVault(environment(), { passphrase: PASSPHRASE, remoteConfig });

    const note = await laptop.repository.createNote({ title: "共有メモ" });
    const photo = Uint8Array.from({ length: 300_000 }, (_, index) => index % 251);
    const attachment = await laptop.repository.storeAttachment({ bytes: photo, mimeType: "image/png", fileName: "a.png" });
    appendAttachmentImage(note.body, attachment);
    await laptop.syncEngine!.syncOnce();
    await phone.syncEngine!.syncOnce();
    expect(await phone.repository.readAttachment(attachment.id)).toEqual(photo);

    clock.now = new Date(clock.now.getTime() + EDIT_VERSION_INTERVAL_MILLISECONDS);
    appendParagraph(laptop.repository.note(note.id)!.body, "PC");
    appendParagraph(phone.repository.note(note.id)!.body, "スマホ");
    await laptop.syncEngine!.syncOnce();
    await phone.syncEngine!.syncOnce();
    await laptop.syncEngine!.syncOnce();
    for (const device of [laptop, phone]) {
      expect(bodyPlainText(device.repository.note(note.id)!.body).split("\n").sort()).toEqual(["PC", "スマホ"]);
    }
    // 履歴は、メモごとのフォルダ（versions/<メモの ID>/）に置かれる。
    const store = new WebDavObjectStore(remoteConfig);
    expect((await store.list("versions/")).length).toBeGreaterThan(0);
  });
});

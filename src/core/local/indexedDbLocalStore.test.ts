import "fake-indexeddb/auto";
import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../crypto/randomId";
import { IndexedDbLocalStore } from "./indexedDbLocalStore";

describe("IndexedDbLocalStore", () => {
  // v0.2.0 の DB（版 2）を入れたままアプリを更新した人の DB が、そのまま開けること。
  // ストアや索引を足すときは版を上げ、この試験に「前の版の DB」を足す。
  it("v0.2.0 が作った DB を開いても、記録・添付・設定・履歴が残り、記録の状態の写しができる", async () => {
    const databaseName = `v020-${newRandomId()}`;
    const released = await openDB(databaseName, 2, {
      upgrade(database) {
        database.createObjectStore("settings");
        database.createObjectStore("records", { keyPath: "id" });
        database.createObjectStore("blobs", { keyPath: "id" }).createIndex("byUploaded", "uploadedFlag");
        database.createObjectStore("versions", { keyPath: "id" }).createIndex("byRecord", "recordId");
      },
    });
    await released.put("settings", "device-1", "deviceId");
    await released.put("records", { id: "r1", sealed: new Uint8Array([1]), remoteEtag: "e1", waitingForPush: false });
    await released.put("records", { id: "r2", sealed: new Uint8Array([4]), remoteEtag: null, waitingForPush: true });
    await released.put("blobs", { id: "b1", sealed: new Uint8Array([2]), uploaded: false, uploadedFlag: 0 });
    await released.put("versions", { id: "v1", recordId: "r1", capturedAt: "2026-11-11T00:00:00Z", reason: "edit", sealed: new Uint8Array([3]) });
    released.close();

    const store = new IndexedDbLocalStore(databaseName);
    expect(await store.readSetting("deviceId")).toBe("device-1");
    expect((await store.listRecordEntries())[0]).toEqual({ id: "r1", sealed: new Uint8Array([1]), remoteEtag: "e1", waitingForPush: false });
    expect(await store.listRecordStates()).toEqual([
      { id: "r1", remoteEtag: "e1", waitingForPush: false },
      { id: "r2", remoteEtag: null, waitingForPush: true },
    ]);
    expect((await store.listBlobsWaitingForUpload()).map((blob) => blob.id)).toEqual(["b1"]);
    expect((await store.listVersions("r1")).map((version) => version.id)).toEqual(["v1"]);
  });

  it("記録を書くと、状態の写しも同じ中身になる。空にすると両方が消える", async () => {
    const store = new IndexedDbLocalStore(`states-${newRandomId()}`);
    await store.putRecordEntry({ id: "r1", sealed: new Uint8Array([1]), remoteEtag: null, waitingForPush: true });
    await store.putRecordEntry({ id: "r1", sealed: new Uint8Array([2]), remoteEtag: "e2", waitingForPush: false });
    expect(await store.listRecordStates()).toEqual([{ id: "r1", remoteEtag: "e2", waitingForPush: false }]);
    await store.clearEverything();
    expect(await store.listRecordStates()).toEqual([]);
  });
});

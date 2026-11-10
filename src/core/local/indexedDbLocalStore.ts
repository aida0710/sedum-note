// IndexedDB を使う LocalStore。Web 版も Tauri の WebView も同じものを使う。

import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { LocalBlobEntry, LocalRecordEntry, LocalSettingName, LocalStore } from "./localStore";

const DATABASE_VERSION = 1;

interface MemoDatabase extends DBSchema {
  settings: { key: LocalSettingName; value: unknown };
  records: { key: string; value: LocalRecordEntry };
  blobs: { key: string; value: LocalBlobEntry; indexes: { byUploaded: number } };
}

// IndexedDB の索引は真偽値を受け付けないので、送ったかどうかを 0・1 で持つ。
type StoredBlob = LocalBlobEntry & { uploadedFlag: number };

export class IndexedDbLocalStore implements LocalStore {
  readonly #database: Promise<IDBPDatabase<MemoDatabase>>;

  constructor(databaseName: string) {
    this.#database = openDB<MemoDatabase>(databaseName, DATABASE_VERSION, {
      upgrade(database) {
        database.createObjectStore("settings");
        database.createObjectStore("records", { keyPath: "id" });
        database.createObjectStore("blobs", { keyPath: "id" }).createIndex("byUploaded", "uploadedFlag");
      },
    });
  }

  async readSetting<Value>(name: LocalSettingName): Promise<Value | undefined> {
    return (await (await this.#database).get("settings", name)) as Value | undefined;
  }

  async writeSetting(name: LocalSettingName, value: unknown): Promise<void> {
    await (await this.#database).put("settings", value, name);
  }

  async listRecordEntries(): Promise<LocalRecordEntry[]> {
    return (await this.#database).getAll("records");
  }

  async getRecordEntry(id: string): Promise<LocalRecordEntry | undefined> {
    return (await this.#database).get("records", id);
  }

  async putRecordEntry(entry: LocalRecordEntry): Promise<void> {
    await (await this.#database).put("records", entry);
  }

  async getBlob(id: string): Promise<LocalBlobEntry | undefined> {
    const stored = await (await this.#database).get("blobs", id);
    return stored ? withoutUploadedFlag(stored as StoredBlob) : undefined;
  }

  async putBlob(entry: LocalBlobEntry): Promise<void> {
    const stored: StoredBlob = { ...entry, uploadedFlag: entry.uploaded ? 1 : 0 };
    await (await this.#database).put("blobs", stored);
  }

  async deleteBlob(id: string): Promise<void> {
    await (await this.#database).delete("blobs", id);
  }

  async listBlobsWaitingForUpload(): Promise<LocalBlobEntry[]> {
    const stored = await (await this.#database).getAllFromIndex("blobs", "byUploaded", 0);
    return stored.map((blob) => withoutUploadedFlag(blob as StoredBlob));
  }

  async clearEverything(): Promise<void> {
    const database = await this.#database;
    const transaction = database.transaction(["settings", "records", "blobs"], "readwrite");
    await Promise.all([
      transaction.objectStore("settings").clear(),
      transaction.objectStore("records").clear(),
      transaction.objectStore("blobs").clear(),
      transaction.done,
    ]);
  }
}

function withoutUploadedFlag(stored: StoredBlob): LocalBlobEntry {
  return { id: stored.id, sealed: stored.sealed, uploaded: stored.uploaded };
}

// IndexedDB を使う LocalStore。Web 版も Tauri の WebView も同じものを使う。

import { type DBSchema, deleteDB, type IDBPDatabase, openDB } from "idb";
import type { LocalBlobEntry, LocalRecordEntry, LocalRecordState, LocalSettingName, LocalStore, LocalVersionEntry, LocalVersionState } from "./localStore";

// 2 で、メモの履歴（versions）を足した。
// 3 で、記録の状態だけの写し（recordStates）を足した。
// 4 で、履歴の状態だけの写し（versionStates）と、履歴を同期先へ送ったかの印を足した。
const DATABASE_VERSION = 4;

interface MemoDatabase extends DBSchema {
  settings: { key: LocalSettingName; value: unknown };
  records: { key: string; value: LocalRecordEntry };
  // records の、暗号文を除いた写し。records と同じトランザクションで書く。
  recordStates: { key: string; value: LocalRecordState };
  blobs: { key: string; value: LocalBlobEntry; indexes: { byUploaded: number } };
  versions: { key: string; value: LocalVersionEntry; indexes: { byRecord: string } };
  // versions の、暗号文を除いた写し。versions と同じトランザクションで書く。
  versionStates: { key: string; value: LocalVersionState };
}

// clearEverything が空にするストア。ストアを足したら、ここと upgrade の両方に足す。
const STORE_NAMES = ["settings", "records", "recordStates", "blobs", "versions", "versionStates"] as const;

// IndexedDB の索引は真偽値を受け付けないので、送ったかどうかを 0・1 で持つ。
type StoredBlob = LocalBlobEntry & { uploadedFlag: number };

// 履歴の暗号文と、その状態の写し。いつも同じ取り引きの中で揃えて書く。
const VERSION_STORE_NAMES = ["versions", "versionStates"] as const;

export class IndexedDbLocalStore implements LocalStore {
  readonly #database: Promise<IDBPDatabase<MemoDatabase>>;

  readonly #databaseName: string;

  constructor(databaseName: string) {
    this.#databaseName = databaseName;
    this.#database = openDB<MemoDatabase>(databaseName, DATABASE_VERSION, {
      // ほかのタブがこの DB を消そうとしたら、つないだままで待たせない。
      blocking(_currentVersion, _blockedVersion, event) {
        (event.target as IDBDatabase).close();
      },
      // 既にある DB には、その版より後に足したストアだけを作る。
      async upgrade(database, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          database.createObjectStore("settings");
          database.createObjectStore("records", { keyPath: "id" });
          database.createObjectStore("blobs", { keyPath: "id" }).createIndex("byUploaded", "uploadedFlag");
        }
        if (oldVersion < 2) {
          database.createObjectStore("versions", { keyPath: "id" }).createIndex("byRecord", "recordId");
        }
        if (oldVersion < 3) {
          const recordStates = database.createObjectStore("recordStates", { keyPath: "id" });
          // 既にある記録の分を写す。
          for (let cursor = await transaction.objectStore("records").openCursor(); cursor; cursor = await cursor.continue()) {
            await recordStates.put(recordStateOf(cursor.value));
          }
        }
        if (oldVersion < 4) {
          const versionStates = database.createObjectStore("versionStates", { keyPath: "id" });
          // 既にある履歴は、まだ同期先へ送っていないものとして写す。
          for (let cursor = await transaction.objectStore("versions").openCursor(); cursor; cursor = await cursor.continue()) {
            const version: LocalVersionEntry = { ...cursor.value, uploaded: false };
            await cursor.update(version);
            await versionStates.put(versionStateOf(version));
          }
        }
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

  async listRecordStates(): Promise<LocalRecordState[]> {
    return (await this.#database).getAll("recordStates");
  }

  async putRecordEntry(entry: LocalRecordEntry): Promise<void> {
    const transaction = (await this.#database).transaction(["records", "recordStates"], "readwrite");
    await Promise.all([
      transaction.objectStore("records").put(entry),
      transaction.objectStore("recordStates").put(recordStateOf(entry)),
      transaction.done,
    ]);
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

  async markAllBlobsForUpload(): Promise<void> {
    const transaction = (await this.#database).transaction("blobs", "readwrite");
    for (let cursor = await transaction.store.openCursor(); cursor; cursor = await cursor.continue()) {
      const waiting: StoredBlob = { ...cursor.value, uploaded: false, uploadedFlag: 0 };
      await cursor.update(waiting);
    }
    await transaction.done;
  }

  async putVersion(entry: LocalVersionEntry): Promise<void> {
    const transaction = (await this.#database).transaction(VERSION_STORE_NAMES, "readwrite");
    await Promise.all([
      transaction.objectStore("versions").put(entry),
      transaction.objectStore("versionStates").put(versionStateOf(entry)),
      transaction.done,
    ]);
  }

  async listVersions(recordId: string): Promise<LocalVersionEntry[]> {
    return (await this.#database).getAllFromIndex("versions", "byRecord", recordId);
  }

  async getVersion(id: string): Promise<LocalVersionEntry | undefined> {
    return (await this.#database).get("versions", id);
  }

  async listVersionStates(): Promise<LocalVersionState[]> {
    return (await this.#database).getAll("versionStates");
  }

  async markVersionUploaded(id: string): Promise<void> {
    const transaction = (await this.#database).transaction(VERSION_STORE_NAMES, "readwrite");
    const version = await transaction.objectStore("versions").get(id);
    if (version) {
      const uploaded: LocalVersionEntry = { ...version, uploaded: true };
      await transaction.objectStore("versions").put(uploaded);
      await transaction.objectStore("versionStates").put(versionStateOf(uploaded));
    }
    await transaction.done;
  }

  async markAllVersionsForUpload(): Promise<void> {
    const transaction = (await this.#database).transaction(VERSION_STORE_NAMES, "readwrite");
    for (let cursor = await transaction.objectStore("versions").openCursor(); cursor; cursor = await cursor.continue()) {
      const waiting: LocalVersionEntry = { ...cursor.value, uploaded: false };
      await cursor.update(waiting);
      await transaction.objectStore("versionStates").put(versionStateOf(waiting));
    }
    await transaction.done;
  }

  async deleteVersion(id: string): Promise<void> {
    const transaction = (await this.#database).transaction(VERSION_STORE_NAMES, "readwrite");
    await Promise.all([transaction.objectStore("versions").delete(id), transaction.objectStore("versionStates").delete(id), transaction.done]);
  }

  async deleteVersionsOfRecord(recordId: string): Promise<void> {
    const transaction = (await this.#database).transaction(VERSION_STORE_NAMES, "readwrite");
    for (const key of await transaction.objectStore("versions").index("byRecord").getAllKeys(recordId)) {
      await transaction.objectStore("versions").delete(key);
      await transaction.objectStore("versionStates").delete(key);
    }
    await transaction.done;
  }

  async clearEverything(): Promise<void> {
    const database = await this.#database;
    const transaction = database.transaction(STORE_NAMES, "readwrite");
    await Promise.all([...STORE_NAMES.map((name) => transaction.objectStore(name).clear()), transaction.done]);
  }

  async destroy(): Promise<void> {
    (await this.#database).close();
    await deleteDB(this.#databaseName);
  }
}

function versionStateOf({ id, recordId, capturedAt, reason, uploaded }: LocalVersionEntry): LocalVersionState {
  return { id, recordId, capturedAt, reason, uploaded };
}

function recordStateOf(entry: LocalRecordEntry): LocalRecordState {
  return { id: entry.id, remoteEtag: entry.remoteEtag, waitingForPush: entry.waitingForPush };
}

function withoutUploadedFlag(stored: StoredBlob): LocalBlobEntry {
  return { id: stored.id, sealed: stored.sealed, uploaded: stored.uploaded };
}

// 手元の記録と同期先を揃える。1 回の syncOnce で次の順に行う。
//
// 1. 送っていない添付を送る（記録より先に置き、参照先の無いメモを見せない）
// 2. 同期先の一覧と手元の ETag を比べ、変わった記録を取り込む
// 3. 手元で変えた記録を条件付き PUT で送る。先に変えられていたら競合を解く
//
// 記録はオブジェクトごとに条件付きで書くので、ロックは要らない。同期先から
// 消えた記録は、手元の写しから送り直す（どこかで消えても、データを失わない）。

import type { LocalRecordEntry, LocalStore } from "../local/localStore";
import type { SerialQueue } from "../local/serialQueue";
import type { SyncedRecord } from "../notes/noteRecords";
import { openRecord, sealRecord } from "../notes/recordCodec";
import { type ObjectStore, PreconditionFailedError, type WriteCondition } from "../remote/objectStore";
import { type ConflictCopyFactory, resolveConflict } from "./conflictResolution";
import { parseVaultDocument, type VaultDocument } from "../vault/vaultDocument";
import { blobObjectKey, RECORDS_PREFIX, recordIdFromObjectKey, recordObjectKey, VAULT_OBJECT_KEY } from "./remoteLayout";

const textDecoder = new TextDecoder();

// 同期先の vault.json が消えたか、別の vault に置き換わった。混ぜると開けない記録が
// 増えるので、同期を止めて知らせる。
export class VaultReplacedError extends Error {
  constructor() {
    super("the storage no longer holds this vault");
    this.name = "VaultReplacedError";
  }
}

export type SyncReport = {
  // 同期先から取り込んだ記録の ID。画面の表示を更新するのに使う。
  pulledIds: string[];
  pushedCount: number;
  conflictCopyIds: string[];
  // 開けなかった記録（壊れている、または別のキーで暗号化されている）。
  unreadableIds: string[];
};

export type SyncEngineDependencies = {
  localStore: LocalStore;
  objectStore: ObjectStore;
  masterKey: CryptoKey;
  writeQueue: SerialQueue;
  conflictCopies: ConflictCopyFactory;
};

export class SyncEngine {
  readonly #dependencies: SyncEngineDependencies;
  #running: Promise<SyncReport> | null = null;

  constructor(dependencies: SyncEngineDependencies) {
    this.#dependencies = dependencies;
  }

  // 同期中にもう一度呼ばれたら、走っている方の結果を返す。
  syncOnce(): Promise<SyncReport> {
    this.#running ??= this.#sync().finally(() => {
      this.#running = null;
    });
    return this.#running;
  }

  async #sync(): Promise<SyncReport> {
    const report: SyncReport = { pulledIds: [], pushedCount: 0, conflictCopyIds: [], unreadableIds: [] };
    await this.#adoptRemoteVaultDocument();
    await this.#uploadWaitingBlobs();
    const remoteEtags = await this.#listRemoteRecords();
    await this.#pullChangedRecords(remoteEtags, report);
    await this.#pushWaitingRecords(remoteEtags, report);
    return report;
  }

  // ほかのデバイスでパスフレーズを変えたら、同期先の vault.json だけが新しくなる。
  // 同じ vault のものなら手元の写しを差し替え、次のロック解除から新しいパスフレーズにする。
  async #adoptRemoteVaultDocument(): Promise<void> {
    const { localStore, objectStore } = this.#dependencies;
    const stored = await objectStore.get(VAULT_OBJECT_KEY);
    const local = await localStore.readSetting<VaultDocument>("vault");
    if (stored === null || !local) {
      throw new VaultReplacedError();
    }
    const remote = parseVaultDocument(textDecoder.decode(stored.body));
    if (remote.vaultId !== local.vaultId) {
      throw new VaultReplacedError();
    }
    if (remote.wrappedMasterKey !== local.wrappedMasterKey) {
      await localStore.writeSetting("vault", remote);
    }
  }

  async #uploadWaitingBlobs(): Promise<void> {
    const { localStore, objectStore } = this.#dependencies;
    for (const blob of await localStore.listBlobsWaitingForUpload()) {
      try {
        await objectStore.put(blobObjectKey(blob.id), blob.sealed, { ifAbsent: true });
      } catch (error) {
        // 添付は ID ごとに中身が決まっているので、既にあれば送り終えたのと同じ。
        if (!(error instanceof PreconditionFailedError)) {
          throw error;
        }
      }
      await localStore.putBlob({ ...blob, uploaded: true });
    }
  }

  async #listRemoteRecords(): Promise<Map<string, string>> {
    const remoteEtags = new Map<string, string>();
    for (const object of await this.#dependencies.objectStore.list(RECORDS_PREFIX)) {
      const id = recordIdFromObjectKey(object.key);
      if (id !== null) {
        remoteEtags.set(id, object.etag);
      }
    }
    return remoteEtags;
  }

  async #pullChangedRecords(remoteEtags: Map<string, string>, report: SyncReport): Promise<void> {
    const { localStore, objectStore, writeQueue } = this.#dependencies;
    const localEntries = new Map((await localStore.listRecordEntries()).map((entry) => [entry.id, entry]));
    for (const [id, etag] of remoteEtags) {
      const local = localEntries.get(id);
      if (local && (local.remoteEtag === etag || local.waitingForPush)) {
        // 揃っている。または手元の変更を送るときに競合として扱う。
        continue;
      }
      const remote = await objectStore.get(recordObjectKey(id));
      if (remote === null) {
        continue;
      }
      if (!(await this.#canOpen(id, remote.body))) {
        report.unreadableIds.push(id);
        continue;
      }
      const stored = await writeQueue.run(async () => {
        const latest = await localStore.getRecordEntry(id);
        if (latest?.waitingForPush) {
          return false;
        }
        await localStore.putRecordEntry({ id, sealed: remote.body, remoteEtag: remote.etag, waitingForPush: false });
        return true;
      });
      if (stored) {
        report.pulledIds.push(id);
      }
    }
    // 同期先から消えた記録は、手元の写しから送り直す。
    for (const entry of localEntries.values()) {
      if (entry.remoteEtag !== null && !remoteEtags.has(entry.id)) {
        await writeQueue.run(async () => {
          const latest = await localStore.getRecordEntry(entry.id);
          if (latest) {
            await localStore.putRecordEntry({ ...latest, remoteEtag: null, waitingForPush: true });
          }
        });
      }
    }
  }

  async #pushWaitingRecords(remoteEtags: Map<string, string>, report: SyncReport): Promise<void> {
    const { localStore } = this.#dependencies;
    const waiting = (await localStore.listRecordEntries()).filter((entry) => entry.waitingForPush);
    for (const entry of waiting) {
      const condition: WriteCondition =
        entry.remoteEtag !== null && remoteEtags.has(entry.id) ? { ifMatch: entry.remoteEtag } : { ifAbsent: true };
      try {
        await this.#pushEntry(entry, condition);
        report.pushedCount += 1;
      } catch (error) {
        if (!(error instanceof PreconditionFailedError)) {
          throw error;
        }
        await this.#resolvePushConflict(entry, report);
      }
    }
  }

  // 送ったあと、送っている間に手元で書き換えられていなければ「揃った」にする。
  async #pushEntry(entry: LocalRecordEntry, condition: WriteCondition): Promise<void> {
    const { localStore, objectStore, writeQueue } = this.#dependencies;
    const { etag } = await objectStore.put(recordObjectKey(entry.id), entry.sealed, condition);
    await writeQueue.run(async () => {
      const latest = await localStore.getRecordEntry(entry.id);
      const unchanged = latest !== undefined && sameBytes(latest.sealed, entry.sealed);
      await localStore.putRecordEntry({
        id: entry.id,
        sealed: latest?.sealed ?? entry.sealed,
        remoteEtag: etag,
        waitingForPush: !unchanged,
      });
    });
  }

  async #resolvePushConflict(entry: LocalRecordEntry, report: SyncReport): Promise<void> {
    const { localStore, objectStore, masterKey, writeQueue, conflictCopies } = this.#dependencies;
    const remote = await objectStore.get(recordObjectKey(entry.id));
    if (remote === null) {
      // 一覧のあとに消された。次の周回で送り直す。
      return;
    }
    let remoteRecord: SyncedRecord;
    try {
      remoteRecord = await openRecord(masterKey, entry.id, remote.body);
    } catch {
      // 同期先の方が開けないなら、手元の方で置き換える。
      await this.#pushEntry(entry, { ifMatch: remote.etag });
      report.pushedCount += 1;
      return;
    }
    const localRecord = await openRecord(masterKey, entry.id, entry.sealed);
    const outcome = resolveConflict(localRecord, remoteRecord, conflictCopies);
    if (outcome.kind === "push_local") {
      await this.#pushEntry(entry, { ifMatch: remote.etag });
      report.pushedCount += 1;
      return;
    }
    const copySealed = outcome.kind === "accept_remote_and_add_copy" ? await sealRecord(masterKey, outcome.copy) : null;
    await writeQueue.run(async () => {
      const latest = await localStore.getRecordEntry(entry.id);
      if (latest && !sameBytes(latest.sealed, entry.sealed)) {
        // 解いている間にまた編集された。その編集を次の周回で同じように扱う。
        await localStore.putRecordEntry({ ...latest, remoteEtag: remote.etag });
        return;
      }
      await localStore.putRecordEntry({ id: entry.id, sealed: remote.body, remoteEtag: remote.etag, waitingForPush: false });
    });
    report.pulledIds.push(entry.id);
    if (outcome.kind === "accept_remote_and_add_copy" && copySealed !== null) {
      const copyEntry: LocalRecordEntry = { id: outcome.copy.id, sealed: copySealed, remoteEtag: null, waitingForPush: true };
      await writeQueue.run(() => localStore.putRecordEntry(copyEntry));
      await this.#pushEntry(copyEntry, { ifAbsent: true });
      report.conflictCopyIds.push(outcome.copy.id);
      report.pulledIds.push(outcome.copy.id);
    }
  }

  async #canOpen(id: string, sealed: Uint8Array): Promise<boolean> {
    try {
      await openRecord(this.#dependencies.masterKey, id, sealed);
      return true;
    } catch {
      return false;
    }
  }

  // 表示するときに、まだ手元に無い添付を同期先から取ってくる。
  async downloadBlob(id: string): Promise<Uint8Array | null> {
    const { localStore, objectStore } = this.#dependencies;
    const remote = await objectStore.get(blobObjectKey(id));
    if (remote === null) {
      return null;
    }
    await localStore.putBlob({ id, sealed: remote.body, uploaded: true });
    return remote.body;
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

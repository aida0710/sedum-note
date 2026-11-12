// 手元の記録と同期先を揃える。1 回の syncOnce で次の順に行う。
//
// 1. 同期先の vault.json を確かめる（同じ vault か。データの形の版を揃える）
// 2. 送っていない添付を送る（記録より先に置き、参照先の無いメモを見せない）
// 3. 同期先の一覧と手元の ETag を比べ、変わった記録を取り込んでマージする（取ってきた束ごとに、vault.json の版を読み直す）
// 4. 手元で変えた記録を条件付き PUT で送る。先に変えられていたら、取り込んでマージしてから送り直す
// 5. メモの履歴を送り、古い履歴を消す（versionSync.ts）
//
// 記録は Yjs の文書なので、2 台の変更はマージで 1 つになり、競合は起きない。条件付き PUT は
// 「マージしていない中身で上書きしない」ために使う。手元の記録の書き込みは NoteRepository が行う。

import type { LocalRecordEntry, LocalStore } from "../local/localStore";
import { ensureDataFormatSupported } from "../format/dataFormat";
import type { NoteRepository } from "../notes/noteRepository";
import { type ObjectStore, PreconditionFailedError, type WriteCondition } from "../remote/objectStore";
import { readRemoteVault, writeRemoteVault } from "../vault/remoteVault";
import type { VaultDocument } from "../vault/vaultDocument";
import { blobObjectKey, RECORDS_PREFIX, recordIdFromObjectKey, recordObjectKey } from "./remoteLayout";
import { VersionSync } from "./versionSync";

// 同期先の vault.json が消えたか、別の vault に置き換わった。混ぜると開けない記録が
// 増えるので、同期を止めて知らせる。
export class VaultReplacedError extends Error {
  constructor() {
    super("the storage no longer holds this vault");
    this.name = "VaultReplacedError";
  }
}

// 同期先から一度に取ってくる記録の数。束ごとに vault.json を読み直すので、読み直しの回数と、取り込む前に手元に持つ
// 暗号文の量の釣り合いで決めた。
const PULL_BATCH_SIZE = 50;

type FetchedRecord = { id: string; body: Uint8Array; etag: string };

export type SyncReport = {
  // 同期先から取り込んだ記録の数。
  pulledCount: number;
  pushedCount: number;
  // 開けなかった記録（壊れている、または別のキーで暗号化されている）。
  unreadableIds: string[];
};

export type SyncEngineDependencies = {
  localStore: LocalStore;
  objectStore: ObjectStore;
  repository: NoteRepository;
  // このアプリが扱えるデータの形の版（format/dataFormat.ts）。
  dataFormatVersion: number;
  // 履歴を同期先に置くときに、理由と時刻を包む鍵。
  masterKey: CryptoKey;
  now?: () => Date;
};

export class SyncEngine {
  readonly #dependencies: SyncEngineDependencies;
  readonly #versionSync: VersionSync;
  #running: Promise<SyncReport> | null = null;

  constructor(dependencies: SyncEngineDependencies) {
    this.#dependencies = dependencies;
    const { localStore, objectStore, masterKey, repository } = dependencies;
    this.#versionSync = new VersionSync({
      localStore, objectStore, masterKey, isRecordRemoved: (recordId) => repository.isRemoved(recordId), now: dependencies.now ?? (() => new Date()),
    });
  }

  // 同期中にもう一度呼ばれたら、走っている方の結果を返す。
  syncOnce(): Promise<SyncReport> {
    this.#running ??= this.#sync().finally(() => {
      this.#running = null;
    });
    return this.#running;
  }

  async #sync(): Promise<SyncReport> {
    const report: SyncReport = { pulledCount: 0, pushedCount: 0, unreadableIds: [] };
    await this.#checkRemoteVault();
    await this.#uploadWaitingBlobs();
    const remoteEtags = await this.#listRemoteRecords();
    await this.#pullChangedRecords(remoteEtags, report);
    await this.#pushWaitingRecords(remoteEtags, report);
    // 記録を送る間に貼られた添付や、削除の印の上へ送り直すことになった添付を送る。
    await this.#uploadWaitingBlobs();
    await this.#versionSync.uploadWaitingVersions();
    await this.#versionSync.sweepRemoteVersionsIfDue();
    return report;
  }

  // 同期先が同じ vault かを確かめ、データの形の版を揃える。同期先の方が新しければ同期を止め、
  // このアプリの方が新しければ同期先を引き上げる。
  // 同期先の文書は暗号化キーで、手元の文書はこのデバイスのパスフレーズで包んであるので、互いに写さない
  // （写すと、手元のパスフレーズでロックを解除できなくなる）。
  async #checkRemoteVault(): Promise<void> {
    const { localStore, objectStore, dataFormatVersion } = this.#dependencies;
    const stored = await readRemoteVault(objectStore);
    const local = await localStore.readSetting<VaultDocument>("vault");
    if (stored === null || !local || stored.document.vaultId !== local.vaultId) {
      throw new VaultReplacedError();
    }
    ensureDataFormatSupported(stored.document.bodySchema, dataFormatVersion);
    if (stored.document.bodySchema < dataFormatVersion) {
      // 新しい形のメモを送る前に引き上げる。ほかのデバイスが同時に書き換えたら、失敗させて次の同期でやり直す。
      await writeRemoteVault(objectStore, { ...stored.document, bodySchema: dataFormatVersion }, { ifMatch: stored.etag });
    }
    const bodySchema = Math.max(stored.document.bodySchema, dataFormatVersion);
    if (bodySchema !== local.bodySchema) {
      await localStore.writeSetting("vault", { ...local, bodySchema });
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
    const { localStore, repository } = this.#dependencies;
    // 件数が多くても軽いよう、暗号文は読まずに ETag だけを比べる。
    const localEntries = new Map((await localStore.listRecordStates()).map((entry) => [entry.id, entry]));
    const changedIds = [...remoteEtags].filter(([id, etag]) => localEntries.get(id)?.remoteEtag !== etag).map(([id]) => id);
    for (let start = 0; start < changedIds.length; start += PULL_BATCH_SIZE) {
      const fetched = await this.#fetchRecords(changedIds.slice(start, start + PULL_BATCH_SIZE));
      await this.#ensureRemoteDataFormatSupported();
      for (const record of fetched) {
        if (await this.#merge(record, report)) {
          report.pulledCount += 1;
        }
      }
    }
    for (const entry of localEntries.values()) {
      if (entry.remoteEtag !== null && !remoteEtags.has(entry.id)) {
        await repository.markMissingRemotely(entry.id);
      }
    }
  }

  // 同期先の記録を取ってくる（手元へはまだ入れない）。取ってくる間に消えていた記録は飛ばす。
  async #fetchRecords(ids: string[]): Promise<FetchedRecord[]> {
    const fetched: FetchedRecord[] = [];
    for (const id of ids) {
      const remote = await this.#dependencies.objectStore.get(recordObjectKey(id));
      if (remote !== null) {
        fetched.push({ id, body: remote.body, etag: remote.etag });
      }
    }
    return fetched;
  }

  // 取ってきた記録を手元へ入れる前に、同期先の vault.json の版を読み直す。同期の始めに確かめたあとで、新しい版のアプリが
  // 版を引き上げ、新しい形の記録を送っていることがある（版は、記録を送る前に引き上げる決まり）。入れると、このアプリの
  // エディタが知らないノードを消し、その削除が同期で広がるので、入れずに止める。
  async #ensureRemoteDataFormatSupported(): Promise<void> {
    const stored = await readRemoteVault(this.#dependencies.objectStore);
    if (stored === null) {
      throw new VaultReplacedError();
    }
    ensureDataFormatSupported(stored.document.bodySchema, this.#dependencies.dataFormatVersion);
  }

  // 取ってきた記録を、手元の記録へマージする。取り込めたら true。
  async #merge(record: FetchedRecord, report: SyncReport): Promise<boolean> {
    try {
      await this.#dependencies.repository.applyRemote(record.id, record.body, record.etag);
      return true;
    } catch {
      if (!report.unreadableIds.includes(record.id)) {
        report.unreadableIds.push(record.id);
      }
      return false;
    }
  }

  // 1 件の記録を取ってきて、版を読み直してからマージする（送るときに先を越された記録）。取り込めたら true。
  async #fetchAndMerge(id: string, report: SyncReport): Promise<boolean> {
    const [record] = await this.#fetchRecords([id]);
    if (!record) {
      return false;
    }
    await this.#ensureRemoteDataFormatSupported();
    return this.#merge(record, report);
  }

  async #pushWaitingRecords(remoteEtags: Map<string, string>, report: SyncReport): Promise<void> {
    const { repository } = this.#dependencies;
    for (const entry of await repository.entriesWaitingForPush()) {
      try {
        await this.#pushEntry(entry, remoteEtags.has(entry.id));
        report.pushedCount += 1;
      } catch (error) {
        if (!(error instanceof PreconditionFailedError)) {
          throw error;
        }
        // 一覧を取ったあとに、ほかのデバイスが先に書いた。取り込んでマージし、その上へ送り直す。
        // それも先を越されたら、次の周回に回す。
        if (!(await this.#fetchAndMerge(entry.id, report))) {
          continue;
        }
        report.pulledCount += 1;
        const merged = (await repository.entriesWaitingForPush()).find((candidate) => candidate.id === entry.id);
        if (!merged) {
          continue;
        }
        try {
          await this.#pushEntry(merged, true);
          report.pushedCount += 1;
        } catch (retryError) {
          if (!(retryError instanceof PreconditionFailedError)) {
            throw retryError;
          }
        }
      }
    }
  }

  async #pushEntry(entry: LocalRecordEntry, existsRemotely: boolean): Promise<void> {
    const { objectStore, repository } = this.#dependencies;
    const condition: WriteCondition =
      entry.remoteEtag !== null && existsRemotely ? { ifMatch: entry.remoteEtag } : { ifAbsent: true };
    const { etag } = await objectStore.put(recordObjectKey(entry.id), entry.sealed, condition);
    const { removedAttachmentIds, recordRemoved } = await repository.confirmPushed(entry, etag);
    // 削除の印が同期先に入ってから、貼ってあった添付と履歴を消す（消したら戻せない）。
    for (const attachmentId of removedAttachmentIds) {
      await objectStore.delete(blobObjectKey(attachmentId));
    }
    if (recordRemoved) {
      await this.#versionSync.removeVersionsOfRecord(entry.id);
    }
  }

  // メモの履歴を開いたときに、ほかのデバイスが残した版を同期先から取ってくる。
  downloadVersions(noteId: string): Promise<void> {
    return this.#versionSync.downloadVersionsOfRecord(noteId);
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

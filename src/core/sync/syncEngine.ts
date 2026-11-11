// 手元の記録と同期先を揃える。1 回の syncOnce で次の順に行う。
//
// 1. 同期先の vault.json を確かめる（ほかのデバイスでのパスフレーズの変更を取り込み、本文の形の版を揃える）
// 2. 送っていない添付を送る（記録より先に置き、参照先の無いメモを見せない）
// 3. 同期先の一覧と手元の ETag を比べ、変わった記録を取り込んでマージする
// 4. 手元で変えた記録を条件付き PUT で送る。先に変えられていたら、取り込んでマージしてから送り直す
//
// 記録は Yjs の文書なので、2 台の変更はマージで 1 つになり、競合は起きない。条件付き PUT は
// 「マージしていない中身で上書きしない」ために使う。手元の記録の書き込みは NoteRepository が行う。

import type { LocalRecordEntry, LocalStore } from "../local/localStore";
import { ensureBodySchemaSupported } from "../notes/bodySchema";
import type { NoteRepository } from "../notes/noteRepository";
import { type ObjectStore, PreconditionFailedError, type WriteCondition } from "../remote/objectStore";
import { readRemoteVault, writeRemoteVault } from "../vault/remoteVault";
import type { VaultDocument } from "../vault/vaultDocument";
import { blobObjectKey, RECORDS_PREFIX, recordIdFromObjectKey, recordObjectKey } from "./remoteLayout";

// 同期先の vault.json が消えたか、別の vault に置き換わった。混ぜると開けない記録が
// 増えるので、同期を止めて知らせる。
export class VaultReplacedError extends Error {
  constructor() {
    super("the storage no longer holds this vault");
    this.name = "VaultReplacedError";
  }
}

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
  // このアプリが扱える本文の形の版（notes/bodySchema.ts）。
  bodySchemaVersion: number;
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
    const report: SyncReport = { pulledCount: 0, pushedCount: 0, unreadableIds: [] };
    await this.#adoptRemoteVaultDocument();
    await this.#uploadWaitingBlobs();
    const remoteEtags = await this.#listRemoteRecords();
    await this.#pullChangedRecords(remoteEtags, report);
    await this.#pushWaitingRecords(remoteEtags, report);
    // 記録を送る間に貼られた添付や、削除の印の上へ送り直すことになった添付を送る。
    await this.#uploadWaitingBlobs();
    return report;
  }

  // ほかのデバイスでパスフレーズを変えたら、同期先の vault.json だけが新しくなる。
  // 同じ vault のものなら手元の写しを差し替え、次のロック解除から新しいパスフレーズにする。
  // 本文の形の版は、同期先の方が新しければ同期を止め、このアプリの方が新しければ同期先を引き上げる。
  async #adoptRemoteVaultDocument(): Promise<void> {
    const { localStore, objectStore, bodySchemaVersion } = this.#dependencies;
    const stored = await readRemoteVault(objectStore);
    const local = await localStore.readSetting<VaultDocument>("vault");
    if (stored === null || !local || stored.document.vaultId !== local.vaultId) {
      throw new VaultReplacedError();
    }
    ensureBodySchemaSupported(stored.document.bodySchema, bodySchemaVersion);
    let current = stored.document;
    if (current.bodySchema < bodySchemaVersion) {
      current = { ...current, bodySchema: bodySchemaVersion };
      // 新しい形のメモを送る前に引き上げる。ほかのデバイスが同時に書き換えたら、失敗させて次の同期でやり直す。
      await writeRemoteVault(objectStore, current, { ifMatch: stored.etag });
    }
    if (current.wrappedMasterKey !== local.wrappedMasterKey || current.bodySchema !== local.bodySchema) {
      await localStore.writeSetting("vault", current);
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
    for (const [id, etag] of remoteEtags) {
      if (localEntries.get(id)?.remoteEtag === etag) {
        continue;
      }
      if (await this.#fetchAndMerge(id, report)) {
        report.pulledCount += 1;
      }
    }
    for (const entry of localEntries.values()) {
      if (entry.remoteEtag !== null && !remoteEtags.has(entry.id)) {
        await repository.markMissingRemotely(entry.id);
      }
    }
  }

  // 同期先の記録を取ってきて、手元の記録へマージする。取り込めたら true。
  async #fetchAndMerge(id: string, report: SyncReport): Promise<boolean> {
    const remote = await this.#dependencies.objectStore.get(recordObjectKey(id));
    if (remote === null) {
      return false;
    }
    try {
      await this.#dependencies.repository.applyRemote(id, remote.body, remote.etag);
      return true;
    } catch {
      if (!report.unreadableIds.includes(id)) {
        report.unreadableIds.push(id);
      }
      return false;
    }
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
    const { removedAttachmentIds } = await repository.confirmPushed(entry, etag);
    // 削除の印が同期先に入ってから、貼ってあった添付を消す（消したら戻せない）。
    for (const attachmentId of removedAttachmentIds) {
      await objectStore.delete(blobObjectKey(attachmentId));
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

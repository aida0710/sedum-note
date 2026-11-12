// メモの履歴（notes/noteVersions.ts）を同期先と揃える。
//
//   送る        同期のたびに、まだ送っていない版（編集の前、置き換えの前）を置く。一度置いた版は変えない
//   取ってくる  メモの履歴を開いたときに、そのメモの分だけを取ってくる（全部のメモの分を、同期のたびには取らない）
//   消す        残す数と期間の決まり（notes/versionRetention.ts）から外れた版を消す。版を送ったメモの分はそのときに、
//               それ以外は 1 日に 1 回、同期先の一覧をまとめて見て消す。残した時刻がオブジェクトの名前に入っているので、
//               中身を取ってこずに決められる
//
// メモを完全に削除したら、そのメモの履歴も同期先から消す。

import type { LocalStore, LocalVersionState } from "../local/localStore";
import { openVersionPayload, sealVersionPayload } from "../notes/versionCodec";
import { versionsToRemove } from "../notes/versionRetention";
import { type ObjectStore, PreconditionFailedError } from "../remote/objectStore";
import { type RemoteVersion, versionFromObjectKey, versionObjectKey, VERSIONS_PREFIX, versionsPrefixOfRecord } from "./remoteLayout";

// 同期先の履歴の一覧を、まとめて見直す間隔。古い履歴は 90 日たってから消えるものなので、1 日に 1 回で足りる。
export const REMOTE_VERSION_SWEEP_INTERVAL_MILLISECONDS = 24 * 60 * 60 * 1000;

// 1 回の同期で送る版の数の上限。履歴がたまったデバイスが初めて送るときに、メモの同期を長く待たせない。
// 残りは次の同期（1 分おき）に回す。
export const MAX_VERSION_UPLOADS_PER_SYNC = 50;

export type VersionSyncDependencies = {
  localStore: LocalStore;
  objectStore: ObjectStore;
  masterKey: CryptoKey;
  // 完全に削除した記録か。削除したメモの履歴は、同期先に残さない。
  isRecordRemoved: (recordId: string) => boolean;
  now: () => Date;
};

// sync の版（ほかのデバイスの変更を取り込む前の控え）は、そのデバイスだけに持つ。
function isSynced(version: LocalVersionState): boolean {
  return version.reason !== "sync";
}

export class VersionSync {
  readonly #dependencies: VersionSyncDependencies;

  constructor(dependencies: VersionSyncDependencies) {
    this.#dependencies = dependencies;
  }

  // まだ送っていない版を（1 回の上限まで）送り、送ったメモの、決まりから外れた版を同期先から消す。
  async uploadWaitingVersions(): Promise<void> {
    const { localStore, objectStore, masterKey } = this.#dependencies;
    const recordIdsWithNewVersions = new Set<string>();
    const waiting = (await localStore.listVersionStates()).filter((version) => isSynced(version) && !version.uploaded);
    for (const state of waiting.slice(0, MAX_VERSION_UPLOADS_PER_SYNC)) {
      const version = await localStore.getVersion(state.id);
      if (!version || version.reason === "sync") {
        continue;
      }
      const identity = { recordId: version.recordId, versionId: version.id };
      const sealed = await sealVersionPayload(masterKey, identity, { reason: version.reason, capturedAt: version.capturedAt, sealedRecord: version.sealed });
      try {
        await objectStore.put(versionObjectKey({ ...identity, capturedAtMilliseconds: new Date(version.capturedAt).getTime() }), sealed, { ifAbsent: true });
      } catch (error) {
        // 版は ID ごとに中身が決まっているので、既にあれば送り終えたのと同じ。
        if (!(error instanceof PreconditionFailedError)) {
          throw error;
        }
      }
      await localStore.markVersionUploaded(version.id);
      recordIdsWithNewVersions.add(version.recordId);
    }
    for (const recordId of recordIdsWithNewVersions) {
      await this.#removeOutdatedVersions(await this.#listRemoteVersions(versionsPrefixOfRecord(recordId)));
    }
  }

  // 前に見直してから 1 日たっていたら、同期先の履歴を全部見て、決まりから外れた版と、削除したメモの版を消す。
  async sweepRemoteVersionsIfDue(): Promise<void> {
    const { localStore, isRecordRemoved, now } = this.#dependencies;
    const sweptAt = await localStore.readSetting<string>("remoteVersionsSweptAt");
    if (sweptAt !== undefined && now().getTime() - new Date(sweptAt).getTime() < REMOTE_VERSION_SWEEP_INTERVAL_MILLISECONDS) {
      return;
    }
    const versionsByRecord = new Map<string, RemoteVersion[]>();
    for (const version of await this.#listRemoteVersions(VERSIONS_PREFIX)) {
      versionsByRecord.set(version.recordId, [...(versionsByRecord.get(version.recordId) ?? []), version]);
    }
    for (const [recordId, versions] of versionsByRecord) {
      if (isRecordRemoved(recordId)) {
        await this.#removeVersions(versions);
      } else {
        await this.#removeOutdatedVersions(versions);
      }
    }
    await localStore.writeSetting("remoteVersionsSweptAt", now().toISOString());
  }

  // 完全に削除したメモの履歴を、同期先から消す。
  async removeVersionsOfRecord(recordId: string): Promise<void> {
    await this.#removeVersions(await this.#listRemoteVersions(versionsPrefixOfRecord(recordId)));
  }

  // メモの履歴を、同期先と同じにする: 手元に無い版を取ってきて、ほかのデバイスが消した版を手元からも消す。
  // 開けない版（別のキーの暗号文など）は飛ばす。
  async downloadVersionsOfRecord(recordId: string): Promise<void> {
    const { localStore, objectStore, masterKey } = this.#dependencies;
    const listed = await this.#listRemoteVersions(versionsPrefixOfRecord(recordId));
    const outdated = new Set(versionsToRemove(listed, this.#dependencies.now()));
    await this.#removeVersions([...outdated]);
    const remoteVersions = listed.filter((version) => !outdated.has(version));
    const remoteIds = new Set(remoteVersions.map((version) => version.versionId));
    const localVersions = (await localStore.listVersionStates()).filter((version) => version.recordId === recordId && isSynced(version));
    for (const version of localVersions.filter((candidate) => candidate.uploaded && !remoteIds.has(candidate.id))) {
      await localStore.deleteVersion(version.id);
    }
    const localIds = new Set(localVersions.map((version) => version.id));
    for (const version of remoteVersions.filter((candidate) => !localIds.has(candidate.versionId))) {
      const stored = await objectStore.get(versionObjectKey(version));
      if (stored === null) {
        continue;
      }
      try {
        const payload = await openVersionPayload(masterKey, version, stored.body);
        await localStore.putVersion({ id: version.versionId, recordId, capturedAt: payload.capturedAt, reason: payload.reason, sealed: payload.sealedRecord, uploaded: true });
      } catch {
        continue;
      }
    }
  }

  async #listRemoteVersions(prefix: string): Promise<RemoteVersion[]> {
    return (await this.#dependencies.objectStore.list(prefix))
      .map((object) => versionFromObjectKey(object.key))
      .filter((version) => version !== null);
  }

  // 1 件のメモの版のうち、決まりから外れたものを、同期先と手元から消す。
  async #removeOutdatedVersions(versionsOfOneNote: RemoteVersion[]): Promise<void> {
    await this.#removeVersions(versionsToRemove(versionsOfOneNote, this.#dependencies.now()));
  }

  async #removeVersions(versions: RemoteVersion[]): Promise<void> {
    const { localStore, objectStore } = this.#dependencies;
    for (const version of versions) {
      await objectStore.delete(versionObjectKey(version));
      await localStore.deleteVersion(version.versionId);
    }
  }
}

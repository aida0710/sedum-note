// メモの履歴（notes/noteVersions.ts）を同期先と揃える。
//
//   送る        同期のたびに、まだ送っていない版（編集の前、置き換えの前）を置く。一度置いた版は変えない
//   取ってくる  メモの履歴を開いたときに、そのメモの分だけを取ってくる（全部のメモの分を、同期のたびには取らない）
//   消す        残す数と期間の決まり（notes/versionRetention.ts）から外れた版を消す。版を送ったメモの分はそのときに、
//               それ以外は 1 日に 1 回、同期先の一覧をまとめて見て消す。残した時刻を暗号化してオブジェクトの名前に入れてあるので
//               （versionObjectKey.ts）、中身を取ってこずに決められる
//
// メモを完全に削除したら、そのメモの履歴も同期先から消す。

import type { LocalStore, LocalVersionState } from "../local/localStore";
import { openVersionPayload, sealVersionPayload } from "../notes/versionCodec";
import { versionsToRemove } from "../notes/versionRetention";
import type { ObjectStore } from "../remote/objectStore";
import { VERSIONS_PREFIX, versionsPrefixOfRecord } from "./remoteLayout";
import { readVersionObjectKey, type RemoteVersion, versionObjectKey } from "./versionObjectKey";

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

function groupByRecord<Version extends { recordId: string }>(versions: Version[]): Map<string, Version[]> {
  const versionsByRecord = new Map<string, Version[]>();
  for (const version of versions) {
    versionsByRecord.set(version.recordId, [...(versionsByRecord.get(version.recordId) ?? []), version]);
  }
  return versionsByRecord;
}

export class VersionSync {
  readonly #dependencies: VersionSyncDependencies;

  constructor(dependencies: VersionSyncDependencies) {
    this.#dependencies = dependencies;
  }

  // まだ送っていない版を（1 回の上限まで）送り、送ったメモの、決まりから外れた版を同期先から消す。
  async uploadWaitingVersions(): Promise<void> {
    const { localStore, objectStore, masterKey } = this.#dependencies;
    const waiting = (await localStore.listVersionStates()).filter((version) => isSynced(version) && !version.uploaded);
    for (const [recordId, statesOfRecord] of groupByRecord(waiting.slice(0, MAX_VERSION_UPLOADS_PER_SYNC))) {
      // 名前は送るたびに変わるので、送ったあと「送った」と書く前に止まった版は、条件付きの PUT では見分けられない。
      // 先に同期先の一覧を見て、もうある版は送らない。
      const remoteVersions = await this.#listRemoteVersions(versionsPrefixOfRecord(recordId));
      const remoteVersionIds = new Set(remoteVersions.map((version) => version.versionId));
      for (const state of statesOfRecord) {
        const version = await localStore.getVersion(state.id);
        if (!version || version.reason === "sync") {
          continue;
        }
        if (!remoteVersionIds.has(version.id)) {
          const identity = { recordId, versionId: version.id };
          const capturedAtMilliseconds = new Date(version.capturedAt).getTime();
          const sealed = await sealVersionPayload(masterKey, identity, { reason: version.reason, capturedAt: version.capturedAt, sealedRecord: version.sealed });
          const objectKey = await versionObjectKey(masterKey, { ...identity, capturedAtMilliseconds });
          await objectStore.put(objectKey, sealed, { ifAbsent: true });
          remoteVersions.push({ ...identity, capturedAtMilliseconds, objectKey, showsCaptureTime: false });
        }
        await localStore.markVersionUploaded(version.id);
      }
      await this.#removeOutdatedVersions(remoteVersions);
    }
  }

  // 前に見直してから 1 日たっていたら、同期先の履歴を全部見て、決まりから外れた版と、削除したメモの版を消す。
  async sweepRemoteVersionsIfDue(): Promise<void> {
    const { localStore, isRecordRemoved, now } = this.#dependencies;
    const sweptAt = await localStore.readSetting<string>("remoteVersionsSweptAt");
    if (sweptAt !== undefined && now().getTime() - new Date(sweptAt).getTime() < REMOTE_VERSION_SWEEP_INTERVAL_MILLISECONDS) {
      return;
    }
    const remoteVersions: RemoteVersion[] = [];
    for (const listed of await this.#listRemoteVersions(VERSIONS_PREFIX)) {
      const version = listed.showsCaptureTime && !isRecordRemoved(listed.recordId) ? await this.#hideCaptureTime(listed) : listed;
      if (version !== null) {
        remoteVersions.push(version);
      }
    }
    for (const [recordId, versions] of groupByRecord(remoteVersions)) {
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
      const stored = await objectStore.get(version.objectKey);
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
    const { objectStore, masterKey } = this.#dependencies;
    const versions = await Promise.all((await objectStore.list(prefix)).map((object) => readVersionObjectKey(masterKey, object.key)));
    return versions.filter((version) => version !== null);
  }

  // 前の形の名前（残した時刻が平文で入っている）の版を、時刻を暗号化した今の形の名前に置き直す。中身は記録と版の ID に
  // 結び付けて暗号化してあるので、名前を変えても開ける。もう無ければ null。
  async #hideCaptureTime(version: RemoteVersion): Promise<RemoteVersion | null> {
    const { objectStore, masterKey } = this.#dependencies;
    const stored = await objectStore.get(version.objectKey);
    if (stored === null) {
      return null;
    }
    const objectKey = await versionObjectKey(masterKey, version);
    await objectStore.put(objectKey, stored.body, { ifAbsent: true });
    await objectStore.delete(version.objectKey);
    return { ...version, objectKey, showsCaptureTime: false };
  }

  // 1 件のメモの版のうち、決まりから外れたものを、同期先と手元から消す。
  async #removeOutdatedVersions(versionsOfOneNote: RemoteVersion[]): Promise<void> {
    await this.#removeVersions(versionsToRemove(versionsOfOneNote, this.#dependencies.now()));
  }

  async #removeVersions(versions: RemoteVersion[]): Promise<void> {
    const { localStore, objectStore } = this.#dependencies;
    for (const version of versions) {
      await objectStore.delete(version.objectKey);
      await localStore.deleteVersion(version.versionId);
    }
  }
}

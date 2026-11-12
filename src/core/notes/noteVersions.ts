// メモの履歴。本文を編集し始める前の状態と、ほかのデバイスの変更を取り込む前の状態を残す。
// 編集と置き換えの前の状態は、同期先にも置く（sync/versionSync.ts）。バックアップには入れない。
// 残す数と期間の決まりは versionRetention.ts。
//
// 残すのは、手元に保存してあった記録の暗号文そのもの。記録の ID に結び付いているので、
// 開くときも記録と同じ手順（recordCodec.ts）で開ける。

import type * as Y from "yjs";
import { newRandomId } from "../crypto/randomId";
import type { LocalStore, LocalVersionEntry } from "../local/localStore";
import { bodyAttachments, bodyPlainText } from "./bodyText";
import { openRecordPayload } from "./recordCodec";
import { latestFieldTime, readField, recordBody, recordDocumentFromState } from "./recordDocument";
import { versionsToRemove } from "./versionRetention";

// 編集の前の状態を残す間隔。打つたびに残すと増えすぎるので、前に残してから（まだ残していなければ、
// メモを作ってから）これだけ空いたあとの編集で残す。
export const EDIT_VERSION_INTERVAL_MILLISECONDS = 10 * 60 * 1000;

export type NoteVersion = {
  id: string;
  capturedAt: string;
  reason: LocalVersionEntry["reason"];
  // その状態が最後に変えられた時刻。
  updatedAt: string;
  title: string;
  plainText: string;
};

export type NoteVersionHistoryDependencies = {
  localStore: LocalStore;
  masterKey: CryptoKey;
  now: () => Date;
};

export class NoteVersionHistory {
  readonly #dependencies: NoteVersionHistoryDependencies;
  // メモごとの、次の「編集の前」を残す間隔の起点（ミリ秒）。最後に残した時刻か、まだ残していなければ
  // メモを作った時刻。まだ調べていないメモは入っていない。
  readonly #editCaptureBaselines = new Map<string, number>();

  constructor(dependencies: NoteVersionHistoryDependencies) {
    this.#dependencies = dependencies;
  }

  // 本文の編集を保存する直前に呼ぶ。sealedBeforeEdit は、それまで手元に保存してあった暗号文。
  async captureBeforeEdit(recordId: string, sealedBeforeEdit: Uint8Array): Promise<void> {
    const now = this.#dependencies.now().getTime();
    const baseline = await this.#editCaptureBaseline(recordId);
    if (baseline !== null && now - baseline < EDIT_VERSION_INTERVAL_MILLISECONDS) {
      return;
    }
    const doc = await this.#openDocument(recordId, sealedBeforeEdit);
    if (doc === null) {
      return;
    }
    try {
      if (baseline === null) {
        // まだ 1 つも残していないメモは、作った時刻を起点にする（作ってすぐの書きかけは残さない）。
        const createdAt = new Date(readField<string>(doc, "createdAt") ?? 0).getTime();
        if (now - createdAt < EDIT_VERSION_INTERVAL_MILLISECONDS) {
          this.#editCaptureBaselines.set(recordId, createdAt);
          return;
        }
      }
      // 何も書いていない状態は、残しても戻す中身が無い。
      if (bodyPlainText(recordBody(doc)) === "" && bodyAttachments(recordBody(doc)).length === 0) {
        return;
      }
    } finally {
      doc.destroy();
    }
    await this.#put(recordId, "edit", sealedBeforeEdit);
    this.#editCaptureBaselines.set(recordId, now);
    await this.#removeOutdatedVersions(recordId);
  }

  // 本文を丸ごと置き換える直前に呼ぶ。間隔を空けずに毎回残す（数は「編集の前」と合わせて上限まで）。
  async captureBeforeReplace(recordId: string, sealedBeforeReplace: Uint8Array): Promise<void> {
    await this.#put(recordId, "replace", sealedBeforeReplace);
    await this.#removeOutdatedVersions(recordId);
  }

  // ほかのデバイスの変更を取り込む直前に呼ぶ。メモごとに、いちばん新しい 1 つだけを残す。
  async captureBeforeSync(recordId: string, sealedBeforeSync: Uint8Array): Promise<void> {
    const { localStore } = this.#dependencies;
    for (const version of await localStore.listVersions(recordId)) {
      if (version.reason === "sync") {
        await localStore.deleteVersion(version.id);
      }
    }
    await this.#put(recordId, "sync", sealedBeforeSync);
  }

  // 新しい順。開けないもの（別のキーの暗号文など）は除く。
  async list(recordId: string): Promise<NoteVersion[]> {
    await this.#removeOutdatedVersions(recordId);
    const versions: NoteVersion[] = [];
    for (const entry of await this.#dependencies.localStore.listVersions(recordId)) {
      const doc = await this.#openDocument(recordId, entry.sealed);
      if (doc === null) {
        continue;
      }
      versions.push({
        id: entry.id,
        capturedAt: entry.capturedAt,
        reason: entry.reason,
        updatedAt: latestFieldTime(doc),
        title: readField<string>(doc, "title") ?? "",
        plainText: bodyPlainText(recordBody(doc)),
      });
      doc.destroy();
    }
    return versions.sort((left, right) => right.capturedAt.localeCompare(left.capturedAt));
  }

  // 版の文書を開く。使い終わったら destroy する。無ければ null。
  async openVersionDocument(recordId: string, versionId: string): Promise<Y.Doc | null> {
    const entry = (await this.#dependencies.localStore.listVersions(recordId)).find((version) => version.id === versionId);
    return entry ? this.#openDocument(recordId, entry.sealed) : null;
  }

  // メモを完全に削除したときに呼ぶ。
  async forget(recordId: string): Promise<void> {
    this.#editCaptureBaselines.delete(recordId);
    await this.#dependencies.localStore.deleteVersionsOfRecord(recordId);
  }

  async #put(recordId: string, reason: LocalVersionEntry["reason"], sealed: Uint8Array): Promise<void> {
    await this.#dependencies.localStore.putVersion({
      id: newRandomId(), recordId, reason, sealed, capturedAt: this.#dependencies.now().toISOString(), uploaded: false,
    });
  }

  // 手元の履歴から起点を決める。「編集の前」が 1 つも無ければ null（起点は文書を開いて決める）。
  async #editCaptureBaseline(recordId: string): Promise<number | null> {
    const known = this.#editCaptureBaselines.get(recordId);
    if (known !== undefined) {
      return known;
    }
    const captureTimes = (await this.#dependencies.localStore.listVersions(recordId))
      .filter((version) => version.reason === "edit")
      .map((version) => new Date(version.capturedAt).getTime());
    if (captureTimes.length === 0) {
      return null;
    }
    const latest = Math.max(...captureTimes);
    this.#editCaptureBaselines.set(recordId, latest);
    return latest;
  }

  // 残す数と期間の決まりから外れた版を、手元から消す。同期先の分は、同期のときに同じ決まりで消す。
  // 「同期の取り込みの前」は別に 1 つだけ持つので、数に入れない。
  async #removeOutdatedVersions(recordId: string): Promise<void> {
    const versions = (await this.#dependencies.localStore.listVersions(recordId))
      .filter((version) => version.reason !== "sync")
      .map((version) => ({ id: version.id, capturedAtMilliseconds: new Date(version.capturedAt).getTime() }));
    for (const outdated of versionsToRemove(versions, this.#dependencies.now())) {
      await this.#dependencies.localStore.deleteVersion(outdated.id);
    }
  }

  async #openDocument(recordId: string, sealed: Uint8Array): Promise<Y.Doc | null> {
    try {
      const payload = await openRecordPayload(this.#dependencies.masterKey, recordId, sealed);
      return payload.kind === "state" ? recordDocumentFromState(payload.state) : null;
    } catch {
      return null;
    }
  }
}

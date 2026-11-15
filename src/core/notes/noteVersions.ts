// メモの履歴。書いている途中の区切り（書くのを止めて、また書き始めた所）の状態、AI・MCP・プラグインが本文を変える前と後の
// 状態、履歴の版へ戻す前の状態、ほかのデバイスの変更を取り込む前の状態を残す。
// 取り込みの前の状態のほかは、同期先にも置く（sync/versionSync.ts）。バックアップには入れない。
// 残す数と期間の決まりは versionRetention.ts。
//
// 残すのは、手元に保存してあった記録の暗号文そのもの。記録の ID に結び付いているので、
// 開くときも記録と同じ手順（recordCodec.ts）で開ける。

import type * as Y from "yjs";
import { newRandomId } from "../crypto/randomId";
import type { LocalStore, LocalVersionEntry, VersionChangedBy } from "../local/localStore";
import { bodyAttachments, bodyPlainText } from "./bodyText";
import { openRecordPayload } from "./recordCodec";
import { latestFieldTime, readField, recordBody, recordDocumentFromState } from "./recordDocument";
import { versionsToRemove } from "./versionRetention";

// 書くのをこれだけ止めたら、ひとまとまりの編集が終わったとみなす。止めたあとにまた書き始めたとき、止める前の状態を
// 「自分の編集」として残す（打つたびには残さない。続けて書いている間は 1 つの版にまとまる）。Notion の「やめて約 2 分後」に近い長さ。
export const EDIT_PAUSE_MILLISECONDS = 3 * 60 * 1000;

export type NoteVersion = {
  id: string;
  capturedAt: string;
  reason: LocalVersionEntry["reason"];
  // その状態を作ったもの（AI・MCP・プラグイン）。edit の版で無ければ、利用者が書いた状態。
  changedBy?: VersionChangedBy;
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

  constructor(dependencies: NoteVersionHistoryDependencies) {
    this.#dependencies = dependencies;
  }

  // 本文の編集を保存する直前に呼ぶ。sealedBeforeEdit は、それまで手元に保存してあった暗号文、lastEditedAt はその状態を
  // 最後に編集した時刻（ミリ秒。まだ編集していなければ null）。書くのを EDIT_PAUSE_MILLISECONDS 以上止めていたら、
  // 止める前の状態を「自分の編集」として残す。続けて書いている間は、暗号文を開かずに返す（保存のたびに呼ばれるため）。
  async captureAfterPause(recordId: string, sealedBeforeEdit: Uint8Array, lastEditedAt: number | null): Promise<void> {
    if (lastEditedAt !== null && this.#dependencies.now().getTime() - lastEditedAt < EDIT_PAUSE_MILLISECONDS) {
      return;
    }
    await this.captureState(recordId, sealedBeforeEdit);
  }

  // 今の状態を、間隔に関わらず残す。changedBy は、その状態を作ったもの（AI・MCP・プラグインが変えた直後）。
  // 無ければ利用者が書いた状態（AI などが変える直前の、利用者の書きかけ）。何も書いていない状態と、いちばん新しい版と
  // 同じ状態は残さない。
  async captureState(recordId: string, sealed: Uint8Array, changedBy?: VersionChangedBy): Promise<void> {
    const doc = await this.#openDocument(recordId, sealed);
    if (doc === null) {
      return;
    }
    try {
      if (isEmptyBody(doc) || await this.#hasSameContentAsNewestVersion(recordId, doc)) {
        return;
      }
    } finally {
      doc.destroy();
    }
    await this.#putAndRemoveOutdated(recordId, { reason: "edit", changedBy }, sealed);
  }

  // 履歴の版へ戻す直前に呼ぶ。戻す前の状態を、間隔に関わらず残す。
  async captureBeforeRestore(recordId: string, sealedBeforeRestore: Uint8Array): Promise<void> {
    await this.#putAndRemoveOutdated(recordId, { reason: "restore" }, sealedBeforeRestore);
  }

  // ほかのデバイスの変更を取り込む直前に呼ぶ。メモごとに、いちばん新しい 1 つだけを残す。
  async captureBeforeSync(recordId: string, sealedBeforeSync: Uint8Array): Promise<void> {
    const { localStore } = this.#dependencies;
    for (const version of await localStore.listVersions(recordId)) {
      if (version.reason === "sync") {
        await localStore.deleteVersion(version.id);
      }
    }
    await this.#put(recordId, { reason: "sync" }, sealedBeforeSync);
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
        changedBy: entry.changedBy,
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
    await this.#dependencies.localStore.deleteVersionsOfRecord(recordId);
  }

  async #put(recordId: string, capture: Pick<LocalVersionEntry, "reason" | "changedBy">, sealed: Uint8Array): Promise<void> {
    const versions = await this.#dependencies.localStore.listVersions(recordId);
    // AI が変える前と後のように、同じミリ秒に続けて残すことがある。並びが前後しないよう、前に残した版より後の時刻にする。
    const latestCapturedAt = Math.max(0, ...versions.map((version) => new Date(version.capturedAt).getTime()));
    const capturedAt = new Date(Math.max(this.#dependencies.now().getTime(), latestCapturedAt + 1)).toISOString();
    await this.#dependencies.localStore.putVersion({ id: newRandomId(), recordId, ...capture, sealed, capturedAt, uploaded: false });
  }

  async #putAndRemoveOutdated(recordId: string, capture: Pick<LocalVersionEntry, "reason" | "changedBy">, sealed: Uint8Array): Promise<void> {
    await this.#put(recordId, capture, sealed);
    await this.#removeOutdatedVersions(recordId);
  }

  // いちばん新しく残した版（取り込みの前の控えを除く）と、題と本文が同じか。AI が変える前に残した状態を、変えたあとの
  // 保存でもう一度残さないため（編集した時刻の書き込みだけでも暗号文は変わるので、中身で比べる）。
  async #hasSameContentAsNewestVersion(recordId: string, doc: Y.Doc): Promise<boolean> {
    const newest = (await this.#dependencies.localStore.listVersions(recordId))
      .filter((version) => version.reason !== "sync")
      .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0];
    const newestDoc = newest ? await this.#openDocument(recordId, newest.sealed) : null;
    if (newestDoc === null) {
      return false;
    }
    try {
      return readField(newestDoc, "title") === readField(doc, "title") && recordBody(newestDoc).toString() === recordBody(doc).toString();
    } finally {
      newestDoc.destroy();
    }
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

// 何も書いていない状態か（残しても戻す中身が無い）。
function isEmptyBody(doc: Y.Doc): boolean {
  return bodyPlainText(recordBody(doc)) === "" && bodyAttachments(recordBody(doc)).length === 0;
}

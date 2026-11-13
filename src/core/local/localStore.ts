// 手元の保存先。S3 に置くのと同じ暗号文をそのまま持つので、平文は保存しない。
//
// 記録の中身は Yjs の文書の状態（notes/recordCodec.ts）。検索のための平文は、
// ロック解除のあとにメモリの中だけで作る（notes/noteRepository.ts）。

export type LocalRecordEntry = {
  id: string;
  sealed: Uint8Array;
  // 最後に同期先と揃えたときの ETag。まだ一度も送っていなければ null。
  remoteEtag: string | null;
  // 手元で変えて、まだ同期先へ送っていない。
  waitingForPush: boolean;
};

// 記録の、同期に使う状態だけ（暗号文を除いたもの）。同期のたびに全件を見るので、暗号文を読まずに引けるようにする。
export type LocalRecordState = Omit<LocalRecordEntry, "sealed">;

export type LocalBlobEntry = {
  id: string;
  sealed: Uint8Array;
  // 同期先へ送り終えたか。添付は一度置いたら変えないので、ETag は持たない。
  uploaded: boolean;
};

// メモの過去の状態（履歴）。同期先にも置く（sync/versionSync.ts）。バックアップには入れない。
export type LocalVersionEntry = {
  id: string;
  recordId: string;
  // ISO 8601。この状態を残した時刻。
  capturedAt: string;
  // edit は編集を始める前の状態、sync はほかのデバイスの変更を取り込む前の状態、
  // replace は本文を丸ごと置き換える前（MCP・プラグインの書き換え）の状態、restore は履歴の版へ戻す前の状態。
  reason: "edit" | "sync" | "replace" | "restore";
  // 記録と同じ形の暗号文（recordCodec.ts）。記録の ID に結び付いている。
  sealed: Uint8Array;
  // 同期先へ送り終えたか（同期先から取ってきたものも true）。sync の版は、そのデバイスの控えなので送らない。
  uploaded: boolean;
};

// 履歴の、同期に使う状態だけ（暗号文を除いたもの）。同期のたびに全件を見るので、暗号文を読まずに引けるようにする。
export type LocalVersionState = Omit<LocalVersionEntry, "sealed">;

// remoteVersionsSweptAt は、同期先の古い履歴をまとめて消した時刻（ISO 8601）。
export type LocalSettingName = "vault" | "deviceId" | "sealedRemoteConfig" | "sealedMcpSettings" | "sealedAiSettings" | "sealedPlugins" | "sealedAiChats" | "sealedWorkspaceLayout" | "remoteVersionsSweptAt";

export interface LocalStore {
  readSetting<Value>(name: LocalSettingName): Promise<Value | undefined>;
  writeSetting(name: LocalSettingName, value: unknown): Promise<void>;
  // 暗号文ごと全件を読む。ロック解除のときとバックアップで使う（件数が多いと重い）。
  listRecordEntries(): Promise<LocalRecordEntry[]>;
  // 暗号文を読まずに、全件の状態を返す。
  listRecordStates(): Promise<LocalRecordState[]>;
  getRecordEntry(id: string): Promise<LocalRecordEntry | undefined>;
  putRecordEntry(entry: LocalRecordEntry): Promise<void>;
  getBlob(id: string): Promise<LocalBlobEntry | undefined>;
  putBlob(entry: LocalBlobEntry): Promise<void>;
  // 無くても成功にする。
  deleteBlob(id: string): Promise<void>;
  listBlobsWaitingForUpload(): Promise<LocalBlobEntry[]>;
  // 手元の添付を全部、送っていないことにする（同期先を別の場所に付け替えたとき）。
  markAllBlobsForUpload(): Promise<void>;
  putVersion(entry: LocalVersionEntry): Promise<void>;
  listVersions(recordId: string): Promise<LocalVersionEntry[]>;
  getVersion(id: string): Promise<LocalVersionEntry | undefined>;
  // 暗号文を読まずに、全部のメモの履歴の状態を返す。
  listVersionStates(): Promise<LocalVersionState[]>;
  // 送り終えた印を付ける。送っている間に消された版には、何もしない。
  markVersionUploaded(id: string): Promise<void>;
  // 手元の履歴を全部、送っていないことにする（同期先を別の場所に付け替えたとき）。
  markAllVersionsForUpload(): Promise<void>;
  deleteVersion(id: string): Promise<void>;
  deleteVersionsOfRecord(recordId: string): Promise<void>;
  // 中身を空にして使い続ける（バックアップを戻す前など）。同期先は消さない。
  clearEverything(): Promise<void>;
  // このデバイスのデータを消す。先に保存先を閉じるので、消している間や消したあとに届いた
  // 書き込み（保存待ちの入力、走っている同期）は失敗し、消したものが書き戻されない。
  // 呼んだあと、この LocalStore は使えない。
  destroy(): Promise<void>;
}

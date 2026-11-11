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

export type LocalBlobEntry = {
  id: string;
  sealed: Uint8Array;
  // 同期先へ送り終えたか。添付は一度置いたら変えないので、ETag は持たない。
  uploaded: boolean;
};

// メモの過去の状態（履歴）。このデバイスだけに持ち、同期もバックアップもしない。
export type LocalVersionEntry = {
  id: string;
  recordId: string;
  // ISO 8601。この状態を残した時刻。
  capturedAt: string;
  // edit は編集を始める前の状態、sync はほかのデバイスの変更を取り込む前の状態。
  reason: "edit" | "sync";
  // 記録と同じ形の暗号文（recordCodec.ts）。記録の ID に結び付いている。
  sealed: Uint8Array;
};

export type LocalSettingName = "vault" | "deviceId" | "sealedRemoteConfig";

export interface LocalStore {
  readSetting<Value>(name: LocalSettingName): Promise<Value | undefined>;
  writeSetting(name: LocalSettingName, value: unknown): Promise<void>;
  listRecordEntries(): Promise<LocalRecordEntry[]>;
  getRecordEntry(id: string): Promise<LocalRecordEntry | undefined>;
  putRecordEntry(entry: LocalRecordEntry): Promise<void>;
  getBlob(id: string): Promise<LocalBlobEntry | undefined>;
  putBlob(entry: LocalBlobEntry): Promise<void>;
  // 無くても成功にする。
  deleteBlob(id: string): Promise<void>;
  listBlobsWaitingForUpload(): Promise<LocalBlobEntry[]>;
  putVersion(entry: LocalVersionEntry): Promise<void>;
  listVersions(recordId: string): Promise<LocalVersionEntry[]>;
  deleteVersion(id: string): Promise<void>;
  deleteVersionsOfRecord(recordId: string): Promise<void>;
  // 中身を空にして使い続ける（バックアップを戻す前など）。同期先は消さない。
  clearEverything(): Promise<void>;
  // このデバイスのデータを消す。先に保存先を閉じるので、消している間や消したあとに届いた
  // 書き込み（保存待ちの入力、走っている同期）は失敗し、消したものが書き戻されない。
  // 呼んだあと、この LocalStore は使えない。
  destroy(): Promise<void>;
}

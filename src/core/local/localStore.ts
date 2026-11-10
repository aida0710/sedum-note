// 手元の保存先。S3 に置くのと同じ暗号文をそのまま持つので、平文は保存しない。
//
// 検索のための平文の索引は、ロック解除のあとにメモリの中だけで作る
// （notes/noteRepository.ts）。

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

export type LocalSettingName = "vault" | "deviceId" | "sealedRemoteConfig";

export interface LocalStore {
  readSetting<Value>(name: LocalSettingName): Promise<Value | undefined>;
  writeSetting(name: LocalSettingName, value: unknown): Promise<void>;
  listRecordEntries(): Promise<LocalRecordEntry[]>;
  getRecordEntry(id: string): Promise<LocalRecordEntry | undefined>;
  putRecordEntry(entry: LocalRecordEntry): Promise<void>;
  getBlob(id: string): Promise<LocalBlobEntry | undefined>;
  putBlob(entry: LocalBlobEntry): Promise<void>;
  listBlobsWaitingForUpload(): Promise<LocalBlobEntry[]>;
  // ロック解除をやり直す（このデバイスから全部消す）ときに使う。同期先は消さない。
  clearEverything(): Promise<void>;
}

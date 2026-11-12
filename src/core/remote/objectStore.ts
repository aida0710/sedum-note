// 同期先（S3 互換ストレージ）の操作。同期の処理はこのインターフェースだけを見る。
//
// 同時書き込みは条件付き PUT で防ぐ。新しいオブジェクトは「まだ無いときだけ」
// （If-None-Match: *）、既存のものは「最後に見た ETag のときだけ」（If-Match）書く。

export type ObjectSummary = { key: string; etag: string };

// 同期先への要求を送って、応答を返す。届かなければ失敗を投げる。Web 版はブラウザの fetch、アプリはアプリの側から送る
// （ui/platform/storageRequestSender.ts）。
export type StorageRequestSender = (request: Request) => Promise<Response>;

export const sendWithFetch: StorageRequestSender = (request) => fetch(request);

export type StoredObject = { body: Uint8Array; etag: string };

export type WriteCondition = { ifMatch: string } | { ifAbsent: true };

export interface ObjectStore {
  // prefix の下のオブジェクトを全部返す（ページ送りは中で行う）。
  list(prefix: string): Promise<ObjectSummary[]>;
  // prefix の下にオブジェクトが 1 つでもあるか。全部を数えずに確かめる。
  hasObjectsUnder(prefix: string): Promise<boolean>;
  // prefix のすぐ下の「フォルダ」（次の「/」までの名前）を返す。多ければ maxCount までで切る。
  listFolders(prefix: string, maxCount: number): Promise<string[]>;
  // 無ければ null。
  get(key: string): Promise<StoredObject | null>;
  // 条件が合わなければ PreconditionFailedError を投げる。
  put(key: string, body: Uint8Array, condition: WriteCondition): Promise<{ etag: string }>;
  // 無くても成功にする。
  delete(key: string): Promise<void>;
}

export class PreconditionFailedError extends Error {
  constructor(key: string) {
    super(`another device changed ${key} first`);
    this.name = "PreconditionFailedError";
  }
}

export type ObjectStoreFailureReason =
  // 届かない（ネットワーク、DNS、CORS で断られたときもブラウザからはこう見える）。
  | "unreachable"
  // 認証情報が違う、または権限が無い。
  | "forbidden"
  | "bucket_not_found"
  // 応答に ETag が無い。CORS の ExposeHeaders に ETag が無いときに起きる。
  | "etag_hidden"
  // 条件付き PUT を無視して上書きする。同時に書いたときに片方の変更が消えるので使わない。
  | "conditional_writes_unsupported"
  | "unexpected_response";

export class ObjectStoreError extends Error {
  readonly reason: ObjectStoreFailureReason;

  constructor(reason: ObjectStoreFailureReason, message: string) {
    super(message);
    this.name = "ObjectStoreError";
    this.reason = reason;
  }
}

// S3 の ETag は引用符付きで返る。一覧と PUT の応答で比べられるように外す。
export function normalizeEtag(etag: string): string {
  return etag.replace(/^W\//, "").replace(/^"|"$/g, "");
}

// 同期先の設定と、その検査。同期先は、S3 互換ストレージか WebDAV のサーバー。
//
// つなぎ先は https に限る。本文は暗号文でも、署名付きのリクエスト（S3）は回線で拾われると時刻のずれの範囲で
// 再送でき、WebDAV はパスワードをそのまま送るため。例外はこのマシンの中で閉じる loopback だけ（手元のサーバーでの試験用）。

// S3 互換ストレージ（Amazon S3、Cloudflare R2、Backblaze B2、Wasabi、MinIO など）。
// kind を持たない設定は S3（WebDAV を足す前に保存した設定と、書き出した同期の設定が、そのまま読める）。
export type S3RemoteConfig = {
  kind?: "s3";
  // 例: https://s3.ap-northeast-1.amazonaws.com、https://<account>.r2.cloudflarestorage.com
  endpoint: string;
  bucket: string;
  // AWS S3 はバケットのリージョン、Cloudflare R2 は "auto"。署名に入るので違うと断られる。
  region: string;
  // バケットの中の置き場所。空ならバケットの直下。
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
};

// WebDAV のサーバー（Nextcloud など）。
export type WebDavRemoteConfig = {
  kind: "webdav";
  // メモを置くフォルダの URL。例: https://cloud.example.com/remote.php/dav/files/<ユーザー>/sedum-note
  url: string;
  username: string;
  password: string;
};

export type RemoteConfig = S3RemoteConfig | WebDavRemoteConfig;

export function isWebDavConfig(config: RemoteConfig): config is WebDavRemoteConfig {
  return config.kind === "webdav";
}

export type RemoteConfigProblem =
  | "endpoint_not_https"
  | "endpoint_has_path"
  | "bucket_name_invalid"
  | "prefix_invalid"
  | "region_missing"
  | "credentials_missing"
  | "webdav_url_not_https"
  | "webdav_credentials_missing";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);
// S3 のバケット名の決まり（小文字・数字・ハイフン・ドット、3〜63 文字）。
const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
// prefix は URL の一部として署名するので、区切りを足したり上へ抜けたりできる文字を断る。
const PREFIX_SEGMENT_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

// https か、このマシンの中（loopback）への http で、URL に認証情報を含まないか。
function isAllowedOrigin(url: URL): boolean {
  const isLoopback = url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  return (url.protocol === "https:" || isLoopback) && url.username === "" && url.password === "";
}

function parseUrl(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

function findWebDavConfigProblem(config: WebDavRemoteConfig): RemoteConfigProblem | null {
  const url = parseUrl(config.url);
  if (url === null || !isAllowedOrigin(url) || url.search !== "" || url.hash !== "") {
    return "webdav_url_not_https";
  }
  return config.username.trim() === "" || config.password === "" ? "webdav_credentials_missing" : null;
}

export function findRemoteConfigProblem(config: RemoteConfig): RemoteConfigProblem | null {
  if (isWebDavConfig(config)) {
    return findWebDavConfigProblem(config);
  }
  const url = parseUrl(config.endpoint);
  if (url === null || !isAllowedOrigin(url)) {
    return "endpoint_not_https";
  }
  if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    return "endpoint_has_path";
  }
  if (!BUCKET_NAME_PATTERN.test(config.bucket) || config.bucket.includes("..")) {
    return "bucket_name_invalid";
  }
  const prefix = normalizePrefix(config.prefix);
  if (prefix !== "" && prefix.split("/").some((segment) => !PREFIX_SEGMENT_PATTERN.test(segment) || segment === "." || segment === "..")) {
    return "prefix_invalid";
  }
  if (config.region.trim() === "") {
    return "region_missing";
  }
  if (config.accessKeyId.trim() === "" || config.secretAccessKey === "") {
    return "credentials_missing";
  }
  return null;
}

export function normalizePrefix(prefix: string): string {
  return prefix.trim().replace(/^\/+|\/+$/g, "");
}

export function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

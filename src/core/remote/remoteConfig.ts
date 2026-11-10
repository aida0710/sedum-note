// 同期先の設定と、その検査。
//
// エンドポイントは https に限る。本文は暗号文でも、署名付きのリクエストは
// 回線で拾われると時刻のずれの範囲で再送できるため。例外はこのマシンの中で
// 閉じる loopback だけ（手元の S3 互換サーバーでの試験用）。

export type RemoteConfig = {
  // 例: https://<account>.r2.cloudflarestorage.com、https://s3.ap-northeast-1.amazonaws.com
  endpoint: string;
  bucket: string;
  // R2 は "auto"。AWS はバケットのリージョン。署名に入るので違うと断られる。
  region: string;
  // バケットの中の置き場所。空ならバケットの直下。
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type RemoteConfigProblem =
  | "endpoint_not_https"
  | "endpoint_has_path"
  | "bucket_name_invalid"
  | "prefix_invalid"
  | "region_missing"
  | "credentials_missing";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);
// S3 のバケット名の決まり（小文字・数字・ハイフン・ドット、3〜63 文字）。
const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
// prefix は URL の一部として署名するので、区切りを足したり上へ抜けたりできる文字を断る。
const PREFIX_SEGMENT_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export function findRemoteConfigProblem(config: RemoteConfig): RemoteConfigProblem | null {
  let url: URL;
  try {
    url = new URL(config.endpoint);
  } catch {
    return "endpoint_not_https";
  }
  const isLoopback = url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  if ((url.protocol !== "https:" && !isLoopback) || url.username || url.password) {
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

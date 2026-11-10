// S3 互換ストレージへの ObjectStore。署名は aws4fetch（SigV4）、通信は fetch。
//
// Web 版も Tauri の WebView も同じ fetch を使うので、バケットに CORS の設定が要る
// （AllowedHeaders に If-Match・If-None-Match、ExposeHeaders に ETag）。
// 必要な設定は settings 画面の接続テストで案内する。

import { AwsClient } from "aws4fetch";
import { parseListObjectsPage } from "./listObjectsResponse";
import {
  type ObjectStore,
  ObjectStoreError,
  type ObjectSummary,
  normalizeEtag,
  PreconditionFailedError,
  type StoredObject,
  type WriteCondition,
} from "./objectStore";
import { normalizeEndpoint, normalizePrefix, type RemoteConfig } from "./remoteConfig";

// ListObjectsV2 の 1 ページの最大件数（S3 の上限）。
const LIST_PAGE_SIZE = 1000;

export class S3ObjectStore implements ObjectStore {
  readonly #client: AwsClient;
  readonly #bucketUrl: string;
  readonly #keyPrefix: string;

  constructor(config: RemoteConfig) {
    this.#client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: config.region,
      // 失敗の再試行は同期の処理が次の周回で行う。ここで黙って繰り返すと、
      // 断られた理由が画面に出るまで長く待たせる。
      retries: 0,
    });
    this.#bucketUrl = `${normalizeEndpoint(config.endpoint)}/${encodeURIComponent(config.bucket)}`;
    const prefix = normalizePrefix(config.prefix);
    this.#keyPrefix = prefix === "" ? "" : `${prefix}/`;
  }

  async list(prefix: string): Promise<ObjectSummary[]> {
    const fullPrefix = this.#keyPrefix + prefix;
    const objects: ObjectSummary[] = [];
    let continuationToken: string | null = null;
    do {
      const url = new URL(this.#bucketUrl);
      url.searchParams.set("list-type", "2");
      url.searchParams.set("prefix", fullPrefix);
      url.searchParams.set("max-keys", String(LIST_PAGE_SIZE));
      if (continuationToken !== null) {
        url.searchParams.set("continuation-token", continuationToken);
      }
      const response = await this.#send(url.toString(), { method: "GET" });
      await throwUnlessOk(response, "list");
      const page = parseListObjectsPage(await response.text());
      for (const object of page.objects) {
        objects.push({ key: object.key.slice(this.#keyPrefix.length), etag: object.etag });
      }
      continuationToken = page.nextContinuationToken;
    } while (continuationToken !== null);
    return objects;
  }

  async get(key: string): Promise<StoredObject | null> {
    const response = await this.#send(this.#objectUrl(key), { method: "GET" });
    if (response.status === 404) {
      return null;
    }
    await throwUnlessOk(response, key);
    const etag = readEtag(response);
    return { body: new Uint8Array(await response.arrayBuffer()), etag };
  }

  async put(key: string, body: Uint8Array, condition: WriteCondition): Promise<{ etag: string }> {
    const headers: Record<string, string> =
      "ifMatch" in condition ? { "If-Match": `"${condition.ifMatch}"` } : { "If-None-Match": "*" };
    const response = await this.#send(this.#objectUrl(key), {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/octet-stream" },
      body: body as Uint8Array<ArrayBuffer>,
    });
    // 409 は「同じキーへの条件付き書き込みが同時に来た」ときに S3 が返す。
    if (response.status === 412 || response.status === 409) {
      throw new PreconditionFailedError(key);
    }
    await throwUnlessOk(response, key);
    return { etag: readEtag(response) };
  }

  async delete(key: string): Promise<void> {
    const response = await this.#send(this.#objectUrl(key), { method: "DELETE" });
    if (response.status !== 404) {
      await throwUnlessOk(response, key);
    }
  }

  #objectUrl(key: string): string {
    const encodedKey = (this.#keyPrefix + key).split("/").map(encodeURIComponent).join("/");
    return `${this.#bucketUrl}/${encodedKey}`;
  }

  async #send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.#client.fetch(url, { ...init, cache: "no-store" });
    } catch (error) {
      throw new ObjectStoreError("unreachable", `could not reach the storage: ${String(error)}`);
    }
  }
}

function readEtag(response: Response): string {
  const etag = response.headers.get("ETag");
  if (etag === null || etag === "") {
    throw new ObjectStoreError("etag_hidden", "the storage did not expose the ETag header (check the bucket's CORS ExposeHeaders)");
  }
  return normalizeEtag(etag);
}

async function throwUnlessOk(response: Response, subject: string): Promise<void> {
  if (response.ok) {
    return;
  }
  // 本文は読み捨てる。断られた理由は状態コードと S3 のエラーコードで分ける。
  const text = await response.text().catch(() => "");
  const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1] ?? "";
  if (response.status === 403 || response.status === 401) {
    throw new ObjectStoreError("forbidden", `the storage refused the credentials for ${subject} (${code || response.status})`);
  }
  if (code === "NoSuchBucket") {
    throw new ObjectStoreError("bucket_not_found", "the bucket does not exist");
  }
  throw new ObjectStoreError("unexpected_response", `the storage answered ${response.status} ${code} for ${subject}`);
}

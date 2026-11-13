// WebDAV のサーバーへの ObjectStore。オブジェクトのキー（records/<id> など）を、設定のフォルダの URL の下のパスにする。
//
// 同時書き込みは、S3 と同じく条件付き PUT（If-None-Match: *、If-Match）で防ぐ。条件を守らないサーバーは、
// つなぐ前の確認（conditionalWriteCheck.ts）で断る。
// PUT の応答に ETag を返さないサーバー（Apache など）では、書いた直後に読み戻して、中身が自分の書いたものと同じときだけ
// その ETag を自分のものとして採る（違えば、ほかのデバイスが先に書いたものとして扱う）。ETag だけを読むと、PUT と読み取りの
// 間に書かれたほかのデバイスの中身の ETag を、自分のものと取り違える。

import {
  type ObjectStore,
  ObjectStoreError,
  type ObjectSummary,
  normalizeEtag,
  PreconditionFailedError,
  sendWithFetch,
  type StorageRequestSender,
  type StoredObject,
  type WriteCondition,
} from "./objectStore";
import type { WebDavRemoteConfig } from "./remoteConfig";
import { parseMultistatus, type WebDavEntry } from "./webDavMultistatus";

// フォルダの直下だけを一覧する（PROPFIND の Depth）。下の階層は、フォルダごとに一覧し直す
// （Depth: infinity は、断るサーバーが多い）。
const LIST_DEPTH = "1";
const LIST_REQUEST_BODY = '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><resourcetype/><getetag/></prop></propfind>';

// 置き場所のフォルダが無いときに、PUT に返る状態コード（サーバーごとに違う）。
const MISSING_FOLDER_STATUSES = new Set([409, 403, 404]);

function basicAuthorization(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export class WebDavObjectStore implements ObjectStore {
  // 末尾に「/」を付けた、フォルダの URL。
  readonly #folderUrl: string;
  // フォルダの URL のパス（復号したもの。末尾に「/」）。一覧の応答のパスから、キーを取り出すのに使う。
  readonly #folderPath: string;
  readonly #authorization: string;
  readonly #sendRequest: StorageRequestSender;

  constructor(config: WebDavRemoteConfig, sendRequest: StorageRequestSender = sendWithFetch) {
    this.#folderUrl = `${config.url.trim().replace(/\/+$/, "")}/`;
    this.#folderPath = decodeURIComponent(new URL(this.#folderUrl).pathname);
    this.#authorization = basicAuthorization(config.username, config.password);
    this.#sendRequest = sendRequest;
  }

  async list(prefix: string): Promise<ObjectSummary[]> {
    // prefix の最後の「/」までがフォルダで、残りは名前の先頭の文字。
    const folder = prefix.slice(0, prefix.lastIndexOf("/") + 1);
    return (await this.#listFilesUnder(folder)).filter((object) => object.key.startsWith(prefix));
  }

  async hasObjectsUnder(prefix: string): Promise<boolean> {
    return (await this.list(prefix)).length > 0;
  }

  async listFolders(prefix: string, maxCount: number): Promise<string[]> {
    const entries = await this.#listFolder(prefix);
    return entries.filter((entry) => entry.isCollection).map((entry) => entry.key.replace(/\/$/, "").slice(prefix.length)).slice(0, maxCount);
  }

  async get(key: string): Promise<StoredObject | null> {
    const response = await this.#send(key, { method: "GET" });
    if (response.status === 404) {
      return null;
    }
    await throwUnlessOk(response, key);
    return { body: new Uint8Array(await response.arrayBuffer()), etag: readEtag(response) };
  }

  async put(key: string, body: Uint8Array, condition: WriteCondition): Promise<{ etag: string }> {
    let response = await this.#putOnce(key, body, condition);
    // 置き場所のフォルダがまだ無いと、サーバーは 409（Apache は 403、Nextcloud は 404）で断る。フォルダを作って、もう一度だけ書く。
    if (MISSING_FOLDER_STATUSES.has(response.status) && await this.#createFoldersFor(key)) {
      response = await this.#putOnce(key, body, condition);
    }
    if (response.status === 412) {
      throw new PreconditionFailedError(key);
    }
    await throwUnlessOk(response, key);
    const etag = response.headers.get("ETag") ?? response.headers.get("OC-ETag");
    return { etag: etag !== null && etag !== "" ? normalizeEtag(etag) : await this.#etagOfOwnWrite(key, body) };
  }

  async delete(key: string): Promise<void> {
    const response = await this.#send(key, { method: "DELETE" });
    if (response.status !== 404) {
      await throwUnlessOk(response, key);
    }
  }

  #putOnce(key: string, body: Uint8Array, condition: WriteCondition): Promise<Response> {
    const conditionHeader: Record<string, string> = "ifMatch" in condition ? { "If-Match": `"${condition.ifMatch}"` } : { "If-None-Match": "*" };
    return this.#send(key, { method: "PUT", headers: { ...conditionHeader, "Content-Type": "application/octet-stream" }, body: body as Uint8Array<ArrayBuffer> });
  }

  // いま書いたオブジェクトを読み戻して、その ETag を返す。中身が違えば、ほかのデバイスが先に書いている。
  async #etagOfOwnWrite(key: string, written: Uint8Array): Promise<string> {
    const stored = await this.get(key);
    if (stored === null || !sameBytes(stored.body, written)) {
      throw new PreconditionFailedError(key);
    }
    return stored.etag;
  }

  // キーの置き場所のフォルダを、設定のフォルダから順に作る（設定のフォルダも、無ければ作る。その上のフォルダは作らない）。
  // 1 つでも新しく作れたら true（作れなければ、断られた理由はフォルダではない）。
  async #createFoldersFor(key: string): Promise<boolean> {
    const segments = key.split("/").slice(0, -1);
    let createdAny = false;
    for (let depth = 0; depth <= segments.length; depth += 1) {
      const response = await this.#send(depth === 0 ? "" : `${segments.slice(0, depth).join("/")}/`, { method: "MKCOL" });
      // 405 は「もうある」。
      if (response.status === 201) {
        createdAny = true;
      } else if (response.status !== 405) {
        await throwUnlessOk(response, key);
      }
    }
    return createdAny;
  }

  // フォルダと、その下の階層のフォルダの中の、ファイルを全部返す。
  async #listFilesUnder(folder: string): Promise<ObjectSummary[]> {
    const files: ObjectSummary[] = [];
    for (const entry of await this.#listFolder(folder)) {
      if (entry.isCollection) {
        files.push(...await this.#listFilesUnder(entry.key));
      } else if (entry.etag !== null) {
        files.push({ key: entry.key, etag: entry.etag });
      } else {
        throw new ObjectStoreError("etag_missing", "the WebDAV server did not return an ETag for a file");
      }
    }
    return files;
  }

  // フォルダの直下のもの（フォルダ自身は除く）。キーは、設定のフォルダからのパスで、フォルダは末尾に「/」が付く。
  // フォルダがまだ無ければ空。
  async #listFolder(folder: string): Promise<Array<WebDavEntry & { key: string }>> {
    const response = await this.#send(folder, { method: "PROPFIND", headers: { Depth: LIST_DEPTH, "Content-Type": "application/xml" }, body: LIST_REQUEST_BODY });
    if (response.status === 404) {
      return [];
    }
    await throwUnlessOk(response, folder === "" ? "the folder" : folder);
    const ownPath = `${this.#folderPath}${folder}`;
    return parseMultistatus(await response.text())
      .map((entry) => ({ ...entry, path: entry.isCollection && !entry.path.endsWith("/") ? `${entry.path}/` : entry.path }))
      .filter((entry) => entry.path.startsWith(this.#folderPath) && entry.path !== ownPath)
      .map((entry) => ({ ...entry, key: entry.path.slice(this.#folderPath.length) }));
  }

  async #send(key: string, init: RequestInit): Promise<Response> {
    const url = this.#folderUrl + key.split("/").map(encodeURIComponent).join("/");
    try {
      return await this.#sendRequest(new Request(url, { ...init, cache: "no-store", headers: { ...init.headers, Authorization: this.#authorization } }));
    } catch (error) {
      throw new ObjectStoreError("unreachable", `could not reach the WebDAV server: ${String(error)}`);
    }
  }
}

function readEtag(response: Response): string {
  const etag = response.headers.get("ETag");
  if (etag === null || etag === "") {
    throw new ObjectStoreError("etag_missing", "the WebDAV server did not return the ETag header");
  }
  return normalizeEtag(etag);
}

async function throwUnlessOk(response: Response, subject: string): Promise<void> {
  if (response.ok) {
    return;
  }
  // 本文は読み捨てる（つないだまま残さない）。
  await response.text().catch(() => "");
  if (response.status === 401 || response.status === 403) {
    throw new ObjectStoreError("forbidden", `the WebDAV server refused the credentials for ${subject} (${response.status})`);
  }
  throw new ObjectStoreError("unexpected_response", `the WebDAV server answered ${response.status} for ${subject}`);
}

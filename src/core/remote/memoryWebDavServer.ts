// メモリの中の WebDAV サーバー。単体試験で、WebDavObjectStore の要求を受けて、サーバーの癖（PUT の応答に ETag を
// 返すか、条件付きの書き込みを守るか）ごとの動きを確かめるのに使う。

import type { StorageRequestSender } from "./objectStore";

export type MemoryWebDavServerOptions = {
  // PUT の応答に ETag を返すか（Nextcloud は返し、Apache は返さない）。
  returnsEtagOnPut?: boolean;
  // 条件付きの書き込みを無視して上書きするサーバーの真似。
  ignoresWriteConditions?: boolean;
};

type StoredFile = { body: Uint8Array; etag: string };

export class MemoryWebDavServer {
  readonly #files = new Map<string, StoredFile>();
  readonly #folders = new Set<string>(["/"]);
  readonly #options: Required<MemoryWebDavServerOptions>;
  #nextEtag = 1;
  // 受けた要求のメソッドとパス（試験で、送った要求を確かめる）。
  readonly requests: Array<{ method: string; path: string; authorization: string | null }> = [];
  // 次の読み取り（GET）の前に 1 回だけ呼ぶ。ほかのデバイスが割り込んで書いた場面を作るのに使う。
  beforeNextGet: (() => void) | null = null;

  constructor(options: MemoryWebDavServerOptions = {}) {
    this.#options = { returnsEtagOnPut: options.returnsEtagOnPut ?? true, ignoresWriteConditions: options.ignoresWriteConditions ?? false };
  }

  // フォルダを作る（サーバーの側で、先に作っておいたフォルダ）。
  createFolder(path: string): void {
    this.#folders.add(path.endsWith("/") ? path : `${path}/`);
  }

  // ほかのデバイスが書いたことにする。
  writeFile(path: string, body: Uint8Array): void {
    this.#files.set(path, { body, etag: this.#newEtag() });
  }

  readonly send: StorageRequestSender = async (request) => {
    const path = decodeURIComponent(new URL(request.url).pathname);
    this.requests.push({ method: request.method, path, authorization: request.headers.get("Authorization") });
    switch (request.method) {
      case "PROPFIND":
        return this.#list(path);
      case "MKCOL":
        return this.#makeFolder(path);
      case "GET":
        return this.#read(path);
      case "PUT":
        return this.#write(path, request);
      case "DELETE":
        return new Response(null, { status: this.#files.delete(path) ? 204 : 404 });
      default:
        return new Response(null, { status: 405 });
    }
  };

  #newEtag(): string {
    const etag = `etag-${this.#nextEtag}`;
    this.#nextEtag += 1;
    return etag;
  }

  #parentExists(path: string): boolean {
    return this.#folders.has(path.slice(0, path.lastIndexOf("/") + 1));
  }

  #list(path: string): Response {
    if (!this.#folders.has(path)) {
      return new Response(null, { status: 404 });
    }
    const isDirectChild = (child: string) => child !== path && child.startsWith(path) && !child.slice(path.length).replace(/\/$/, "").includes("/");
    const folders = [path, ...[...this.#folders].filter(isDirectChild)];
    const files = [...this.#files].filter(([filePath]) => isDirectChild(filePath));
    // 接頭辞の付け方は、Apache の応答に合わせる（要素ごとに違う接頭辞）。
    const responses = [
      ...folders.map((folder) => `<D:response><D:href>${encodeURI(folder)}</D:href><D:propstat><D:prop><lp1:resourcetype><D:collection/></lp1:resourcetype></D:prop></D:propstat></D:response>`),
      ...files.map(([filePath, file]) => `<D:response><D:href>${encodeURI(filePath)}</D:href><D:propstat><D:prop><lp1:resourcetype/><lp1:getetag>&quot;${file.etag}&quot;</lp1:getetag></D:prop></D:propstat></D:response>`),
    ];
    return new Response(`<?xml version="1.0"?><D:multistatus xmlns:D="DAV:" xmlns:lp1="DAV:">${responses.join("")}</D:multistatus>`, { status: 207 });
  }

  #makeFolder(path: string): Response {
    if (this.#folders.has(path)) {
      return new Response(null, { status: 405 });
    }
    if (!this.#parentExists(path.replace(/\/$/, ""))) {
      return new Response(null, { status: 409 });
    }
    this.#folders.add(path);
    return new Response(null, { status: 201 });
  }

  #read(path: string): Response {
    const interrupt = this.beforeNextGet;
    this.beforeNextGet = null;
    interrupt?.();
    const file = this.#files.get(path);
    return file ? new Response(file.body as Uint8Array<ArrayBuffer>, { headers: { ETag: `"${file.etag}"` } }) : new Response(null, { status: 404 });
  }

  async #write(path: string, request: Request): Promise<Response> {
    if (!this.#parentExists(path)) {
      return new Response(null, { status: 409 });
    }
    const existing = this.#files.get(path);
    const ifMatch = request.headers.get("If-Match");
    const refused = (request.headers.get("If-None-Match") === "*" && existing !== undefined) || (ifMatch !== null && ifMatch !== `"${existing?.etag}"`);
    if (refused && !this.#options.ignoresWriteConditions) {
      return new Response(null, { status: 412 });
    }
    const file = { body: new Uint8Array(await request.arrayBuffer()), etag: this.#newEtag() };
    this.#files.set(path, file);
    return new Response(null, { status: existing ? 204 : 201, headers: this.#options.returnsEtagOnPut ? { ETag: `"${file.etag}"` } : {} });
  }
}

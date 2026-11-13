import { describe, expect, it } from "vitest";
import { ensureConditionalWrites } from "./conditionalWriteCheck";
import { MemoryWebDavServer, type MemoryWebDavServerOptions } from "./memoryWebDavServer";
import { ObjectStoreError, PreconditionFailedError } from "./objectStore";
import { findRemoteConfigProblem, type WebDavRemoteConfig } from "./remoteConfig";
import { parseMultistatus } from "./webDavMultistatus";
import { WebDavObjectStore } from "./webDavObjectStore";

const config: WebDavRemoteConfig = { kind: "webdav", url: "https://dav.example.com/files/me/sedum note/", username: "me", password: "pässword" };
const FOLDER_PATH = "/files/me/sedum note/";

function storeOn(options: MemoryWebDavServerOptions = {}) {
  const server = new MemoryWebDavServer(options);
  server.createFolder("/files/");
  server.createFolder("/files/me/");
  server.createFolder(FOLDER_PATH);
  return { server, store: new WebDavObjectStore(config, server.send) };
}

const bytes = (...values: number[]) => new Uint8Array(values);

describe("WebDavObjectStore", () => {
  it("書いたものを読め、一覧にはフォルダからのキーと ETag が出る。置き場所のフォルダは、足りなければ作る", async () => {
    const { server, store } = storeOn();
    const vault = await store.put("vault.json", bytes(1), { ifAbsent: true });
    const record = await store.put("records/abc", bytes(2), { ifAbsent: true });
    const version = await store.put("versions/abc/0000000000001-v1", bytes(3), { ifAbsent: true });
    expect((await store.get("records/abc"))).toEqual({ body: bytes(2), etag: record.etag });
    expect(await store.get("records/missing")).toBeNull();
    expect(await store.list("records/")).toEqual([{ key: "records/abc", etag: record.etag }]);
    // 下の階層のフォルダの中も、全部たどる（履歴の見直しが使う）。
    expect(await store.list("versions/")).toEqual([{ key: "versions/abc/0000000000001-v1", etag: version.etag }]);
    expect((await store.list("")).map((object) => object.key).sort()).toEqual(["records/abc", "vault.json", "versions/abc/0000000000001-v1"]);
    expect(vault.etag).not.toBe(record.etag);
    expect(await store.hasObjectsUnder("blobs/")).toBe(false);
    expect(await store.listFolders("", 10)).toEqual(["records", "versions"]);
    // フォルダの URL の空白は、要求の URL では符号化して送る。認証は Basic で、UTF-8 のまま符号化する。
    expect(server.requests.every((request) => request.path.startsWith(FOLDER_PATH))).toBe(true);
    expect(server.requests[0]!.authorization).toBe(`Basic ${btoa(String.fromCharCode(...new TextEncoder().encode("me:pässword")))}`);
  });

  it("設定のフォルダがまだ無ければ、最初に書くときに作る", async () => {
    const server = new MemoryWebDavServer();
    server.createFolder("/files/");
    server.createFolder("/files/me/");
    const store = new WebDavObjectStore(config, server.send);
    expect(await store.list("records/")).toEqual([]);
    await store.put("vault.json", bytes(1), { ifAbsent: true });
    expect((await store.get("vault.json"))?.body).toEqual(bytes(1));
  });

  it.each([409, 403, 404])("置き場所のフォルダが無いときの応答が %i のサーバーでも、フォルダを作って書ける", async (missingFolderStatus) => {
    const { store } = storeOn({ missingFolderStatus });
    await store.put("records/abc", bytes(1), { ifAbsent: true });
    expect((await store.get("records/abc"))?.body).toEqual(bytes(1));
  });

  it("新しいキーへの書き込みは 1 回だけ通り、古い ETag での上書きは断られる", async () => {
    const { store } = storeOn();
    const first = await store.put("records/x", bytes(1), { ifAbsent: true });
    await expect(store.put("records/x", bytes(2), { ifAbsent: true })).rejects.toBeInstanceOf(PreconditionFailedError);
    const second = await store.put("records/x", bytes(3), { ifMatch: first.etag });
    await expect(store.put("records/x", bytes(4), { ifMatch: first.etag })).rejects.toBeInstanceOf(PreconditionFailedError);
    expect((await store.get("records/x"))?.etag).toBe(second.etag);
    await store.delete("records/x");
    await store.delete("records/x");
    expect(await store.get("records/x")).toBeNull();
  });

  it("PUT の応答に ETag を返さないサーバーでは、読み戻して、自分の書いた中身のときだけその ETag を採る", async () => {
    const { server, store } = storeOn({ returnsEtagOnPut: false });
    const written = await store.put("records/x", bytes(1), { ifAbsent: true });
    expect((await store.get("records/x"))?.etag).toBe(written.etag);
    // 書いた直後に、ほかのデバイスが上書きした。読み戻した中身が違うので、自分の書き込みとして採らない。
    server.beforeNextGet = () => server.writeFile(`${FOLDER_PATH}records/x`, bytes(9));
    await expect(store.put("records/x", bytes(2), { ifMatch: written.etag })).rejects.toBeInstanceOf(PreconditionFailedError);
  });

  it("条件付きの書き込みを守るサーバーは、つなぐ前の確認を通る。守らないサーバーは断る", async () => {
    await expect(ensureConditionalWrites(storeOn().store)).resolves.toBeUndefined();
    await expect(ensureConditionalWrites(storeOn({ returnsEtagOnPut: false }).store)).resolves.toBeUndefined();
    await expect(ensureConditionalWrites(storeOn({ ignoresWriteConditions: true }).store)).rejects.toMatchObject({ reason: "conditional_writes_unsupported" });
  });

  it("読んだ応答に ETag が無いサーバーは、CORS の設定の話ではなく、ETag を返さないサーバーとして断る", async () => {
    const store = new WebDavObjectStore(config, async () => new Response(bytes(1), { status: 200 }));
    await expect(store.get("vault.json")).rejects.toMatchObject({ reason: "etag_missing" });
  });

  it("認証を断られたら、その旨の失敗にする", async () => {
    const store = new WebDavObjectStore(config, async () => new Response(null, { status: 401 }));
    await expect(store.list("records/")).rejects.toMatchObject({ reason: "forbidden" });
    await expect(store.get("vault.json")).rejects.toBeInstanceOf(ObjectStoreError);
  });
});

describe("parseMultistatus", () => {
  it("接頭辞の付け方や、URL 全体で書かれた場所が違っても読む", () => {
    const xml = `<?xml version="1.0"?>
      <d:multistatus xmlns:d="DAV:">
        <d:response><d:href>https://dav.example.com/remote.php/dav/files/me/notes/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
        <d:response><d:href>/remote.php/dav/files/me/notes/a%20b</d:href><d:propstat><d:prop><d:getetag>&quot;abc&quot;</d:getetag><d:resourcetype/></d:prop></d:propstat></d:response>
        <response xmlns="DAV:"><href>/remote.php/dav/files/me/notes/c</href><propstat><prop><getetag>W/"weak"</getetag></prop></propstat></response>
      </d:multistatus>`;
    expect(parseMultistatus(xml)).toEqual([
      { path: "/remote.php/dav/files/me/notes/", isCollection: true, etag: null },
      { path: "/remote.php/dav/files/me/notes/a b", isCollection: false, etag: "abc" },
      { path: "/remote.php/dav/files/me/notes/c", isCollection: false, etag: "weak" },
    ]);
  });
});

describe("WebDAV の設定の検査", () => {
  it("https のフォルダの URL と、ユーザー名・パスワードが要る", () => {
    expect(findRemoteConfigProblem(config)).toBeNull();
    expect(findRemoteConfigProblem({ ...config, url: "http://127.0.0.1:18480/notes" })).toBeNull();
    expect(findRemoteConfigProblem({ ...config, url: "http://dav.example.com/notes" })).toBe("webdav_url_not_https");
    expect(findRemoteConfigProblem({ ...config, url: "https://me:secret@dav.example.com/notes" })).toBe("webdav_url_not_https");
    expect(findRemoteConfigProblem({ ...config, password: "" })).toBe("webdav_credentials_missing");
  });
});

import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { MemoryWebDavServer } from "../src/core/remote/memoryWebDavServer";
import { createNoteOnDesktop, DESKTOP_VIEWPORT, PASSPHRASE, SYNC_KEY, syncNowOnDesktop } from "./devices";

// 試験の WebDAV サーバーは、試験の中（メモリ）に置き、ブラウザからの要求を横取りして渡す。
const WEBDAV_ORIGIN = "https://webdav.sedum-note.test";
const FOLDER_URL = `${WEBDAV_ORIGIN}/files/tester/notes`;
// ブラウザは、別の origin への要求の前に許可を確かめ、応答の ETag を読むにも許可が要る。
const CORS_HEADERS = {
  "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "ETag",
};

function newServer(): MemoryWebDavServer {
  const server = new MemoryWebDavServer({ returnsEtagOnPut: false });
  server.createFolder("/files/");
  server.createFolder("/files/tester/");
  return server;
}

async function serveWebDav(context: BrowserContext, server: MemoryWebDavServer): Promise<void> {
  await context.route(`${WEBDAV_ORIGIN}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    const response = await server.send(new Request(request.url(), {
      method: request.method(), headers: request.headers(), body: request.postDataBuffer() as Uint8Array<ArrayBuffer> | null,
    }));
    await route.fulfill({ status: response.status, headers: { ...Object.fromEntries(response.headers), ...CORS_HEADERS }, body: Buffer.from(await response.arrayBuffer()) });
  });
}

async function fillWebDavTarget(page: Page, password: string): Promise<void> {
  await page.getByLabel("ほかのデバイスと同期する").check();
  await page.getByRole("radio", { name: "WebDAV" }).click();
  await page.getByLabel("フォルダの URL").fill(FOLDER_URL);
  await page.getByLabel("ユーザー名").fill("tester");
  await page.getByLabel("パスワード", { exact: true }).fill(password);
}

async function startVaultOnWebDav(page: Page, { join }: { join: boolean }): Promise<void> {
  await page.goto("/");
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
  await fillWebDavTarget(page, "secret");
  await page.getByRole("button", { name: "接続を確認" }).click();
  await expect(page.getByRole("status")).toContainText(join ? "既存のメモが見つかりました" : "空の同期先です");
  if (!join) {
    await page.getByRole("radio", { name: "自分で入力する" }).click();
  }
  await page.getByLabel("暗号化キー", { exact: true }).fill(SYNC_KEY);
  await page.getByRole("button", { name: join ? "参加" : "作成" }).click();
}

test("WebDAV のサーバーを同期先にして、2 台で同期できる", async ({ browser }) => {
  const server = newServer();
  const openDevice = async () => {
    const context = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
    await serveWebDav(context, server);
    return context.newPage();
  };
  const laptop = await openDevice();
  await startVaultOnWebDav(laptop, { join: false });
  await createNoteOnDesktop(laptop, "買い物");
  await laptop.keyboard.type("牛乳を買う");
  await syncNowOnDesktop(laptop, "買い物");

  const desktop = await openDevice();
  await startVaultOnWebDav(desktop, { join: true });
  await desktop.locator(".tree-note", { hasText: "買い物" }).first().click();
  await expect(desktop.locator(".ProseMirror")).toHaveText("牛乳を買う");
  // メモは、WebDAV のサーバーの records/ の下に置かれた。
  expect(server.requests.some((request) => request.method === "PUT" && request.path.includes("/records/"))).toBe(true);
  // 設定には、同期先が WebDAV として出る。
  await desktop.locator(".sync-line").click();
  await expect(desktop.getByText(`同期先: WebDAV の ${FOLDER_URL}`)).toBeVisible();
});

test("WebDAV の URL が https でなければ、接続を確かめる前に知らせる。条件付きの書き込みを守らないサーバーは断る", async ({ browser }) => {
  const server = new MemoryWebDavServer({ ignoresWriteConditions: true });
  server.createFolder("/files/");
  server.createFolder("/files/tester/");
  const context = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
  await serveWebDav(context, server);
  const page = await context.newPage();
  await page.goto("/");
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
  await fillWebDavTarget(page, "secret");
  await page.getByLabel("フォルダの URL").fill("http://webdav.sedum-note.test/files/tester/notes");
  await page.getByRole("button", { name: "接続を確認" }).click();
  await expect(page.getByRole("alert")).toContainText("フォルダのURLはhttps://で始めてください。");

  await page.getByLabel("フォルダの URL").fill(FOLDER_URL);
  await page.getByRole("button", { name: "接続を確認" }).click();
  await expect(page.getByRole("status")).toContainText("空の同期先です");
  await page.getByRole("radio", { name: "自分で入力する" }).click();
  await page.getByLabel("暗号化キー", { exact: true }).fill(SYNC_KEY);
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "新しいメモ" })).toHaveCount(0);
});

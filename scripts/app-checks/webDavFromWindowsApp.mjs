// Windows の試験用の VM に入れたアプリから、WebDAV のサーバーを同期先にして同期できるかを確かめる。
// アプリは、WebDAV のメソッド（PROPFIND・MKCOL）を、WebView でなくアプリの側（Rust）から送る。それが通ることを見る。
// 手で流す確認の道具。
//
// 前提: integration/webdav-up.sh と、windowsVm.mjs の先頭のとおり。VM から見た 127.0.0.1:18480 を、手元の WebDAV へつないでおく:
//   ssh -N -R 127.0.0.1:18480:127.0.0.1:18480 <VM>
// 使い方: WINDOWS_VM_SSH_KEY=... WINDOWS_VM_USER=... node scripts/app-checks/webDavFromWindowsApp.mjs <画像を置くフォルダ>

import { PASSPHRASE, SYNC_KEY } from "./checkDevices.mjs";
import { countOnServer, WEBDAV } from "./webDavCheckServer.mjs";
import { captureScreen, pause, startApp } from "./windowsVm.mjs";

const outputDirectory = process.argv[2];

const { browser, page: app } = await startApp({ fresh: true });
await app.evaluate(`localStorage.setItem("sedum-note:devicePreferences", JSON.stringify({ language: "ja", checkForUpdates: false }))`);
await app.reload();
await app.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
await app.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
await app.getByLabel("ほかのデバイスと同期する").check();
await app.getByRole("radio", { name: "WebDAV", exact: true }).click();
await app.locator("#remote-webdav-url").fill(WEBDAV.url);
await app.locator("#remote-webdav-username").fill(WEBDAV.username);
await app.locator("#remote-webdav-password").fill(WEBDAV.password);
await app.getByRole("button", { name: "接続を確認" }).click();
await app.getByRole("radio", { name: /自分で入力する/ }).click();
await app.locator("#new-sync-key").fill(SYNC_KEY);
await app.getByRole("button", { name: "作成" }).click();
await app.getByRole("button", { name: "新しいメモ", exact: true }).click({ timeout: 60_000 });
await app.getByPlaceholder("タイトル").fill("アプリから WebDAV へ");
await app.getByPlaceholder("タイトル").press("Enter");
await app.keyboard.type("Windows のアプリが書いた行");

// 編集から少し待つと、自動で同期する。サーバーに、メモ（records/）が置かれるのを待つ。
const deadline = Date.now() + 60_000;
while ((await countOnServer("records/")) === 0) {
  if (Date.now() > deadline) {
    throw new Error("the note did not reach the WebDAV server within 60s");
  }
  await pause(1_000);
}
captureScreen(outputDirectory, "windows-app-webdav");
console.log(`ok: the app synced through WebDAV (records on the server: ${await countOnServer("records/")})`);
await browser.close();

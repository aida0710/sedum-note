// Linux 版のアプリ（deb を入れたコンテナの中）から、WebDAV のサーバーを同期先にして同期できるかを確かめる。
// アプリは、WebDAV のメソッド（PROPFIND・MKCOL）を、WebView でなくアプリの側（Rust）から送る。それが通ることを見る。
// 手で流す確認の道具。
//
// 前提: integration/webdav-up.sh（127.0.0.1:18480 の Apache）と、scripts/app-checks/linux/run-driver.sh のコンテナ。
// 使い方: node scripts/app-checks/webDavFromLinuxApp.mjs <画像を置くフォルダ>

import { writeFileSync } from "node:fs";
import { PASSPHRASE, SYNC_KEY } from "./checkDevices.mjs";
import { WebDriverSession } from "./webDriverSession.mjs";

const outputDirectory = process.argv[2];
// 試験用のサーバーの、固定の認証情報（integration/webdav-up.sh と同じ）。
const WEBDAV = { url: `http://127.0.0.1:18480/app-check-${Date.now()}`, username: "sedum-note-test", password: "sedum-note-test-password" };
const authorization = `Basic ${Buffer.from(`${WEBDAV.username}:${WEBDAV.password}`).toString("base64")}`;

// サーバーのフォルダの直下にあるものの数（フォルダ自身を除く）。フォルダが無ければ 0。
async function countOnServer(folder) {
  const response = await fetch(`${WEBDAV.url}/${folder}`, { method: "PROPFIND", headers: { Depth: "1", Authorization: authorization } });
  return response.status === 207 ? ((await response.text()).match(/<D:response[\s>]/g)?.length ?? 1) - 1 : 0;
}

const app = await WebDriverSession.start("http://127.0.0.1:14444", {
  browserName: "wry",
  "tauri:options": { application: "/usr/bin/sedum-note" },
});
const runInPage = (script) => app.command("POST", "/execute/sync", { script, args: [] });
try {
  await app.waitForXPath("//input[@id='setup-passphrase']", 30_000);
  await runInPage(`localStorage.setItem("sedum-note:devicePreferences", JSON.stringify({ language: "ja", checkForUpdates: false })); location.reload();`);
  await app.type(await app.waitForXPath("//input[@id='setup-passphrase']", 30_000), PASSPHRASE);
  await app.type(await app.find("#setup-passphrase-confirm"), PASSPHRASE);
  await app.click(await app.findByXPath("//label[contains(., 'ほかのデバイスと同期する')]/input"));
  await app.click(await app.waitForXPath("//button[@role='radio'][normalize-space()='WebDAV']", 10_000));
  await app.type(await app.waitForXPath("//input[@id='remote-webdav-url']", 10_000), WEBDAV.url);
  await app.type(await app.find("#remote-webdav-username"), WEBDAV.username);
  await app.type(await app.find("#remote-webdav-password"), WEBDAV.password);
  await app.click(await app.findByXPath("//button[normalize-space()='接続を確認']"));
  await app.click(await app.waitForXPath("//*[@role='radio'][contains(., '自分で入力する')]", 30_000));
  await app.type(await app.waitForXPath("//input[@id='new-sync-key']", 10_000), SYNC_KEY);
  await app.click(await app.findByXPath("//button[normalize-space()='作成']"));
  await app.click(await app.waitForXPath("//button[normalize-space()='新しいメモ']", 60_000));
  await app.type(await app.waitForXPath("//input[@placeholder='タイトル']", 10_000), "アプリから WebDAV へ");
  await app.type(await app.find(".ProseMirror"), "Linux のアプリが書いた行");

  // 編集から少し待つと、自動で同期する。サーバーに、メモ（records/）が置かれるのを待つ。
  const deadline = Date.now() + 60_000;
  while ((await countOnServer("records/")) === 0) {
    if (Date.now() > deadline) {
      throw new Error("the note did not reach the WebDAV server within 60s");
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  writeFileSync(`${outputDirectory}/linux-app-webdav.png`, await app.screenshotPng());
  console.log(`ok: the app synced through WebDAV (records on the server: ${await countOnServer("records/")})`);
} finally {
  await app.end().catch(() => undefined);
}

// Android のエミュレーターに入れたアプリへ、ほかのアプリの「共有」と同じ Intent を送り、
// 新しいメモになるかを確かめる。手で流す確認の道具で、CI では流さない。配布用（最適化あり）の
// APK で流す（デバッグ版では、最適化で画面との橋が消えていても気づけない）。
//
// 前提: アプリを入れた直後の、初回の画面のまま起動しておく。WebView の DevTools を 127.0.0.1:9333 へつなぐ
//   （`adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`）。
// 使い方: node scripts/app-checks/shareToAndroidApp.mjs <画像を置くフォルダ>
//
// 確かめること:
//   1. ロック中に共有された文字は、ロックを解除するまでメモにならず、解除するとメモになって開く
//   2. 写真の共有は、写真を貼ったメモになる
//   3. アプリを止めた状態で共有されても、起動してロックを解除するとメモになる

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { PASSPHRASE } from "./checkDevices.mjs";

const outputDirectory = process.argv[2];
const adb = `${process.env.ANDROID_HOME}/platform-tools/adb`;
const device = process.env.ANDROID_SERIAL ?? "emulator-5580";
const APP_PACKAGE = "com.github.aida0710.sedumnote";
const DEVTOOLS_PORT = 9333;
// 1x1 の PNG。写真の共有に使う。
const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const shell = (...args) => execFileSync(adb, ["-s", device, "shell", ...args], { encoding: "utf8" });
const captureScreen = (name) => writeFileSync(`${outputDirectory}/${name}.png`, execFileSync(adb, ["-s", device, "exec-out", "screencap", "-p"]));

// 起動し直すと WebView の DevTools の口の名前（プロセスの番号つき）が変わるので、つなぎ直す。
async function connectToApp() {
  const pid = shell("pidof", APP_PACKAGE).trim();
  execFileSync(adb, ["-s", device, "forward", `tcp:${DEVTOOLS_PORT}`, `localabstract:webview_devtools_remote_${pid}`]);
  // 標準の設定（画面の大きさなど）を WebView に押し付けないよう noDefaults を付ける。
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEVTOOLS_PORT}`, { noDefaults: true });
  return browser.contexts()[0].pages()[0];
}

function shareText(subject, text) {
  shell("am", "start", "-a", "android.intent.action.SEND", "-t", "text/plain",
    "--es", "android.intent.extra.SUBJECT", `'${subject}'`, "--es", "android.intent.extra.TEXT", `'${text}'`,
    "-n", `${APP_PACKAGE}/.MainActivity`);
}

async function unlock(app) {
  await app.getByLabel("パスフレーズ").fill(PASSPHRASE);
  await app.getByRole("button", { name: "解除" }).click();
}

// エミュレーターの言語は英語なので、道具が使う日本語の文言にそろえる。
let app = await connectToApp();
await app.evaluate(() => localStorage.setItem("sedum-note:devicePreferences", JSON.stringify({ language: "ja" })));
await app.reload();
await app.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
await app.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
await app.getByRole("button", { name: "作成" }).click();
await app.getByRole("button", { name: "設定" }).click();
await app.getByRole("button", { name: "ロック", exact: true }).click();
await app.getByRole("heading", { name: "ロックを解除" }).waitFor();

// 1. ロック中の共有。
shareText("共有の件名", "ロック中に共有した文 https://example.com/article");
await app.waitForTimeout(2_000);
await app.getByRole("heading", { name: "ロックを解除" }).waitFor();
await unlock(app);
await app.getByPlaceholder("タイトル").waitFor({ timeout: 30_000 });
if ((await app.getByPlaceholder("タイトル").inputValue()) !== "共有の件名") {
  throw new Error("the shared text did not become a note after unlocking");
}
await app.locator(".ProseMirror a[href='https://example.com/article']").waitFor();
captureScreen("share-text-after-unlock");
await app.getByRole("button", { name: "戻る" }).click();

// 2. アプリを開いたままの、写真の共有。
shell(`echo ${TINY_PNG_BASE64} | base64 -d > /sdcard/Pictures/sedum-note-share.png`);
shell("am", "broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE", "-d", "file:///sdcard/Pictures/sedum-note-share.png");
await app.waitForTimeout(3_000);
const mediaRow = shell("content", "query", "--uri", "content://media/external/images/media", "--projection", "_id:_display_name")
  .split("\n").find((row) => row.includes("sedum-note-share.png"));
const mediaId = /_id=(\d+)/.exec(mediaRow ?? "")?.[1];
if (!mediaId) {
  throw new Error("the shared picture was not registered in the media store");
}
shell("am", "start", "-a", "android.intent.action.SEND", "-t", "image/png",
  "--eu", "android.intent.extra.STREAM", `content://media/external/images/media/${mediaId}`,
  "--grant-read-uri-permission", "-n", `${APP_PACKAGE}/.MainActivity`);
await app.locator(".attachment-image img").waitFor({ timeout: 30_000 });
if ((await app.getByPlaceholder("タイトル").inputValue()) !== "sedum-note-share.png") {
  throw new Error("the shared picture did not become a note named after the file");
}
captureScreen("share-picture");

// 3. アプリを止めた状態での共有。
await app.waitForTimeout(1_000);
shell("am", "force-stop", APP_PACKAGE);
shareText("", "止まっている間に共有した文");
await new Promise((resolve) => setTimeout(resolve, 8_000));
app = await connectToApp();
await unlock(app);
await app.getByPlaceholder("タイトル").waitFor({ timeout: 30_000 });
if ((await app.getByPlaceholder("タイトル").inputValue()) !== "止まっている間に共有した文") {
  throw new Error("the text shared while the app was stopped did not become a note");
}
await app.getByRole("button", { name: "戻る" }).click();
const titles = await app.locator(".note-item h3").allTextContents();
captureScreen("share-list");
console.log(`shared content became notes: ${titles.join(" / ")}`);
process.exit(0);

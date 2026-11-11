// 組み立てたアプリ（Android のエミュレーター、Windows の VM）と、手元のブラウザ
// （PC の大きさ）で同じバケットを使い、両方向に同期できるかを確かめる。手で流す確認の
// 道具で、CI では流さない。
//
// 前提: integration/s3-up.sh、`npx vite --host 127.0.0.1 --port 5173`。アプリを初回の
// 画面のまま起動し、その WebView の DevTools を 127.0.0.1:9333 へ、アプリから見た
// 127.0.0.1:18333 を手元の S3 へつないでおく。
// - Android: `adb reverse tcp:18333 tcp:18333`、`adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`
// - Windows: CI の確認用のビルド（sedum-note-Windows-check、DevTools を 9222 に開く）を
//   startWindowsApp.ps1 -App <exe> -Fresh で起動し、`ssh -L 9333:127.0.0.1:9222 -R 18333:127.0.0.1:18333 <VM>`
//
// 使い方: [CDP_ENDPOINT=http://127.0.0.1:9333] CAPTURE=adb|cdp node scripts/app-checks/syncWithApp.mjs <画像を置くフォルダ>
// CAPTURE=adb はエミュレーターの画面を adb で撮る（WebGL などを含めて実際の描画どおり）。

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { expectNoteFromApp, newCheckRemoteConfig, PASSPHRASE, REMOTE_FIELDS, startBrowserDevice, SYNC_KEY } from "./checkDevices.mjs";

const outputDirectory = process.argv[2];
const adb = `${process.env.ANDROID_HOME}/platform-tools/adb`;
const device = process.env.ANDROID_SERIAL ?? "emulator-5580";
const captureWith = process.env.CAPTURE ?? "adb";
// Android のエミュレーターと Windows の VM を同時につないでおけるよう、つなぎ先を選べるようにする。
const devToolsEndpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9333";

async function screenshotDevice(page, name) {
  if (captureWith === "adb") {
    writeFileSync(`${outputDirectory}/${name}.png`, execFileSync(adb, ["-s", device, "exec-out", "screencap", "-p"]));
  } else {
    await page.screenshot({ path: `${outputDirectory}/${name}.png` });
  }
}

// 1. PC でメモを作る。
const remote = await newCheckRemoteConfig();
const laptop = await startBrowserDevice(remote);

// 2. アプリで参加し、PC のメモが届くか。
// 標準の設定（画面の大きさなど）を WebView に押し付けないよう noDefaults を付ける。
const appBrowser = await chromium.connectOverCDP(devToolsEndpoint, { noDefaults: true });
const app = appBrowser.contexts()[0].pages()[0];
await app.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
await app.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
await app.getByLabel("ほかのデバイスと同期する").check();
for (const [label, , field] of REMOTE_FIELDS) {
  await app.getByLabel(label).fill(remote[field]);
}
await app.getByRole("button", { name: "接続を確認" }).click();
await app.getByLabel("暗号化キー", { exact: true }).fill(SYNC_KEY);
await app.getByRole("button", { name: "参加" }).click();
await app.getByRole("button", { name: /PCで書いたメモ/ }).first().waitFor({ timeout: 30_000 });
await screenshotDevice(app, "app-list");

// 3. アプリでメモを書き、PC に届くか。
await app.getByRole("button", { name: "新しいメモ", exact: true }).click();
await app.getByPlaceholder("タイトル").fill("アプリで書いたメモ");
await app.getByPlaceholder("タイトル").press("Enter");
await app.keyboard.type("アプリから同期");
await screenshotDevice(app, "app-editor");
await app.waitForTimeout(4_000);
await expectNoteFromApp(laptop.page, `${outputDirectory}/browser-after-app.png`);
console.log("both directions synced");

// 4. 同じメモを両方で開いたまま書き足し、1 つのメモにマージされるか。
await laptop.page.getByRole("button", { name: /アプリで書いたメモ/ }).first().click();
await laptop.page.locator(".ProseMirror").getByText("アプリから同期").click();
await laptop.page.keyboard.press("Home");
await laptop.page.keyboard.type("PCから追記。");
await app.locator(".ProseMirror").getByText("アプリから同期").click();
await app.keyboard.press("End");
await app.keyboard.type("。アプリから追記");
// どちらも編集の 2 秒後に送る。先に送った方は、もう一度書いたときに相手の分を取り込む。
await app.waitForTimeout(6_000);
await laptop.page.keyboard.press("End");
await laptop.page.keyboard.type("！");
await app.waitForTimeout(6_000);
await app.keyboard.type("？");
await app.waitForTimeout(6_000);
// ほかのデバイスの変更を取りに行くのは 60 秒おきなので、画面に戻ったときの同期を起こして待つ。
await laptop.page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await laptop.page.waitForTimeout(4_000);
// 同時に書いた文字の並び順は決まっていないので、両方が同じ本文で、どの書き込みも含むことを見る。
const browserText = await laptop.page.locator(".ProseMirror").innerText();
const appText = await app.locator(".ProseMirror").innerText();
const written = ["PCから追記。", "アプリから同期", "。アプリから追記", "！", "？"];
if (browserText !== appText || !written.every((part) => browserText.includes(part))) {
  throw new Error(`not merged. browser: ${browserText} / app: ${appText}`);
}
await screenshotDevice(app, "app-merged");
await laptop.page.screenshot({ path: `${outputDirectory}/browser-merged.png` });
console.log("concurrent edits merged");
await laptop.browser.close();
await appBrowser.close();

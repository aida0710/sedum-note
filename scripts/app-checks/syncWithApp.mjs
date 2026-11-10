// 組み立てたアプリ（Android のエミュレーター、Windows の VM）と、手元のブラウザ
// （PC の大きさ）で同じバケットを使い、両方向に同期できるかを確かめる。手で流す確認の
// 道具で、CI では流さない。
//
// 前提: integration/s3-up.sh、`npx vite --host 127.0.0.1 --port 5173`。アプリを初回の
// 画面のまま起動し、その WebView の DevTools を 127.0.0.1:9333 へ、アプリから見た
// 127.0.0.1:18333 を手元の S3 へつないでおく。
// - Android: `adb reverse tcp:18333 tcp:18333`、`adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`
// - Windows: WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 で起動し、
//   `ssh -L 9333:127.0.0.1:9222 -R 18333:127.0.0.1:18333 <VM>`
//
// 使い方: CAPTURE=adb|cdp node scripts/app-checks/syncWithApp.mjs <画像を置くフォルダ>
// CAPTURE=adb はエミュレーターの画面を adb で撮る（WebGL などを含めて実際の描画どおり）。

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { AwsClient } from "aws4fetch";

const outputDirectory = process.argv[2];
const adb = `${process.env.ANDROID_HOME}/platform-tools/adb`;
const device = process.env.ANDROID_SERIAL ?? "emulator-5580";
const passphrase = "correct horse battery";
const remote = {
  endpoint: "http://127.0.0.1:18333", region: "us-east-1", prefix: "memo",
  accessKeyId: "MEMOAPPTESTKEY", secretAccessKey: "memoapptestsecret",
  bucket: `memo-app-check-${Date.now()}`,
};

const captureWith = process.env.CAPTURE ?? "adb";

async function screenshotDevice(page, name) {
  if (captureWith === "adb") {
    writeFileSync(`${outputDirectory}/${name}.png`, execFileSync(adb, ["-s", device, "exec-out", "screencap", "-p"]));
  } else {
    await page.screenshot({ path: `${outputDirectory}/${name}.png` });
  }
}

async function fillRemote(page) {
  await page.getByLabel("エンドポイント").fill(remote.endpoint);
  await page.getByLabel("バケット").fill(remote.bucket);
  await page.getByLabel("リージョン").fill(remote.region);
  await page.getByLabel("フォルダ").fill(remote.prefix);
  await page.getByLabel("アクセスキー ID").fill(remote.accessKeyId);
  await page.getByLabel("シークレットアクセスキー").fill(remote.secretAccessKey);
}

const s3 = new AwsClient({ accessKeyId: remote.accessKeyId, secretAccessKey: remote.secretAccessKey, service: "s3", region: remote.region, retries: 0 });
const created = await s3.fetch(`${remote.endpoint}/${remote.bucket}`, { method: "PUT" });
if (!created.ok) {
  throw new Error(`bucket: ${created.status}`);
}

// 1. PC でメモを作る。
const desktopBrowser = await chromium.launch();
const laptop = await (await desktopBrowser.newContext({ viewport: { width: 1280, height: 820 } })).newPage();
await laptop.goto("http://127.0.0.1:5173/");
await laptop.getByLabel("パスフレーズ", { exact: true }).fill(passphrase);
await laptop.getByLabel("パスフレーズ（確認）").fill(passphrase);
await fillRemote(laptop);
await laptop.getByRole("button", { name: "作成" }).click();
await laptop.getByRole("button", { name: "新しいメモ" }).click();
await laptop.getByPlaceholder("タイトル").fill("PCで書いたメモ");
await laptop.getByPlaceholder("タイトル").press("Enter");
await laptop.keyboard.type("スマホで読めるか確かめる #確認");
await laptop.waitForTimeout(4_000);

// 2. アプリで参加し、PC のメモが届くか。
// 標準の設定（画面の大きさなど）を WebView に押し付けないよう noDefaults を付ける。
const appBrowser = await chromium.connectOverCDP("http://127.0.0.1:9333", { noDefaults: true });
const phone = appBrowser.contexts()[0].pages()[0];
await phone.getByRole("tab", { name: "既存のメモに参加" }).click();
await phone.getByLabel("パスフレーズ", { exact: true }).fill(passphrase);
await fillRemote(phone);
await phone.getByRole("button", { name: "参加" }).click();
await phone.getByRole("button", { name: /PCで書いたメモ/ }).first().waitFor({ timeout: 30_000 });
await screenshotDevice(phone, "app-list");

// 3. アプリでメモを書き、PC に届くか。
await phone.getByRole("button", { name: "新しいメモ", exact: true }).click();
await phone.getByPlaceholder("タイトル").fill("アプリで書いたメモ");
await phone.getByPlaceholder("タイトル").press("Enter");
await phone.keyboard.type("アプリから同期");
await screenshotDevice(phone, "app-editor");
await phone.waitForTimeout(4_000);
await laptop.reload();
await laptop.getByLabel("パスフレーズ").fill(passphrase);
await laptop.getByRole("button", { name: "解除" }).click();
await laptop.getByRole("button", { name: /アプリで書いたメモ/ }).first().waitFor({ timeout: 30_000 });
await laptop.screenshot({ path: `${outputDirectory}/browser-after-app.png` });
console.log("both directions synced");
await desktopBrowser.close();
await appBrowser.close();

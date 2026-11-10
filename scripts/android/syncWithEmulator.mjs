// エミュレーターの Android のアプリと、手元のブラウザ（PC の大きさ）で同じバケットを
// 使い、両方向に同期できるかを確かめる。手で流す確認の道具で、CI では流さない。
//
// 前提: integration/s3-up.sh、`npx vite --host 127.0.0.1 --port 5173`、エミュレーターで
// デバッグ版を起動し、`adb reverse tcp:18333 tcp:18333` と
// `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` を張っておく。
//
// 使い方: node scripts/android/syncWithEmulator.mjs <画像を置くフォルダ>

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
  bucket: `memo-android-${Date.now()}`,
};

function screenshotDevice(name) {
  writeFileSync(`${outputDirectory}/${name}.png`, execFileSync(adb, ["-s", device, "exec-out", "screencap", "-p"]));
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

// 2. Android のアプリで参加し、PC のメモが届くか。
// 標準の設定（画面の大きさなど）を WebView に押し付けないよう noDefaults を付ける。
const androidBrowser = await chromium.connectOverCDP("http://127.0.0.1:9333", { noDefaults: true });
const phone = androidBrowser.contexts()[0].pages()[0];
await phone.getByRole("tab", { name: "既存のメモに参加" }).click();
await phone.getByLabel("パスフレーズ", { exact: true }).fill(passphrase);
await fillRemote(phone);
await phone.getByRole("button", { name: "参加" }).click();
await phone.getByRole("button", { name: /PCで書いたメモ/ }).waitFor({ timeout: 30_000 });
screenshotDevice("android-list");

// 3. Android でメモを書き、PC に届くか。
await phone.getByRole("button", { name: "新しいメモ" }).click();
await phone.getByPlaceholder("タイトル").fill("Androidで書いたメモ");
await phone.getByPlaceholder("タイトル").press("Enter");
await phone.keyboard.type("エミュレーターから同期");
screenshotDevice("android-editor");
await phone.waitForTimeout(4_000);
await laptop.reload();
await laptop.getByLabel("パスフレーズ").fill(passphrase);
await laptop.getByRole("button", { name: "解除" }).click();
await laptop.getByRole("button", { name: /Androidで書いたメモ/ }).waitFor({ timeout: 30_000 });
await laptop.screenshot({ path: `${outputDirectory}/desktop-after-android.png` });
console.log("both directions synced");
await desktopBrowser.close();
await androidBrowser.close();

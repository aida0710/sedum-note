// Linux 版のアプリ（組み立てたもの）で、設定の「更新」の「今すぐ確かめる」が、本物の GitHub に確かめて結果を出すかを見る。
// ロックを解除したときの自動の確認は止めておき、押したときだけ確かめることも見る。手で流す確認の道具。GitHub へ、実際につなぐ。
// 新しいバージョンがあるときの画面を見るには、package.json と src-tauri/tauri.conf.json の版を手元だけ下げて組み立てる。
//
// 前提: scripts/app-checks/linux/build-app.sh で組み立て、scripts/app-checks/linux/run-built-app-driver.sh でコンテナを起動しておく。
// 使い方: node scripts/app-checks/updateCheckInLinuxApp.mjs <画像を置くフォルダ> <画像の名前の頭>

import { writeFileSync } from "node:fs";
import { PASSPHRASE } from "./checkDevices.mjs";
import { WebDriverSession } from "./webDriverSession.mjs";

const outputDirectory = process.argv[2];
const capturePrefix = process.argv[3] ?? "linux-update";
const CHECK_TIMEOUT_MILLISECONDS = 60_000;

const app = await WebDriverSession.start("http://127.0.0.1:14444", {
  browserName: "wry",
  "tauri:options": { application: "/app/sedum-note" },
});
const runInPage = (script) => app.command("POST", "/execute/sync", { script, args: [] });
const capture = async (name) => writeFileSync(`${outputDirectory}/${capturePrefix}-${name}.png`, await app.screenshotPng());
const updateSectionText = () => runInPage("return document.querySelector('.settings-section')?.innerText ?? ''");

try {
  await app.waitForXPath("//input[@id='setup-passphrase']", 30_000);
  await runInPage(`localStorage.setItem("sedum-note:devicePreferences", JSON.stringify({ language: "ja", checkForUpdates: false })); location.reload();`);
  await app.type(await app.waitForXPath("//input[@id='setup-passphrase']", 30_000), PASSPHRASE);
  await app.type(await app.find("#setup-passphrase-confirm"), PASSPHRASE);
  await app.click(await app.findByXPath("//button[normalize-space()='作成']"));
  await app.waitForXPath("//button[normalize-space()='新しいメモ']", 30_000);

  await app.click(await app.findByXPath("//button[@aria-label='設定']"));
  await app.click(await app.waitForXPath("//nav[@aria-label='設定のページ']//button[normalize-space()='更新']", 10_000));
  const checkNow = await app.waitForXPath("//button[normalize-space()='今すぐ確かめる']", 10_000);
  console.log(`before pressing (the check on unlock is off):\n${await updateSectionText()}\n`);
  await capture("before");

  await app.click(checkNow);
  await app.waitForXPath("//*[contains(@class,'settings-section')]//*[contains(., 'に確かめました') or contains(., 'があります') or contains(., '確かめられませんでした')]", CHECK_TIMEOUT_MILLISECONDS);
  console.log(`after pressing:\n${await updateSectionText()}\n`);
  await capture("after");
} finally {
  await app.end().catch(() => undefined);
}

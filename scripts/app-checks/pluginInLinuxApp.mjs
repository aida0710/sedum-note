// Linux 版のアプリ（deb を入れたコンテナの中）で、GitHub からプラグインを取り込み、コマンドを実行できるかを確かめる。
// 組み立てたアプリ（決まった所からしかコードを読まない設定）の中で、ワーカーの中の WebAssembly が動くことと、
// アプリから GitHub へつながることを見る。手で流す確認の道具。GitHub へ、実際につなぐ。
//
// 前提: scripts/app-checks/linux/run-driver.sh でコンテナを起動しておく。
// 使い方: node scripts/app-checks/pluginInLinuxApp.mjs <画像を置くフォルダ> [取り込み元]

import { writeFileSync } from "node:fs";
import { PASSPHRASE } from "./checkDevices.mjs";
import { WebDriverSession } from "./webDriverSession.mjs";

const outputDirectory = process.argv[2];
const pluginSource = process.argv[3] ?? "aida0710/sedum-note/plugins/text-tools";
const WAIT_STEP_MILLISECONDS = 500;

const app = await WebDriverSession.start("http://127.0.0.1:14444", {
  browserName: "wry",
  "tauri:options": { application: "/usr/bin/sedum-note" },
});
const runInPage = (script) => app.command("POST", "/execute/sync", { script, args: [] });
const capture = async (name) => writeFileSync(`${outputDirectory}/${name}.png`, await app.screenshotPng());

async function waitUntil(description, read, isSatisfied, timeoutMilliseconds = 30_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  for (;;) {
    const value = await read();
    if (isSatisfied(value)) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error(`${description}: last value ${JSON.stringify(value)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MILLISECONDS));
  }
}

try {
  await app.waitForXPath("//input[@id='setup-passphrase']", 30_000);
  await runInPage(`localStorage.setItem("sedum-note:devicePreferences", JSON.stringify({ language: "ja", checkForUpdates: false })); location.reload();`);
  await app.type(await app.waitForXPath("//input[@id='setup-passphrase']", 30_000), PASSPHRASE);
  await app.type(await app.find("#setup-passphrase-confirm"), PASSPHRASE);
  await app.click(await app.findByXPath("//button[normalize-space()='作成']"));
  await app.click(await app.waitForXPath("//button[normalize-space()='新しいメモ']", 30_000));
  await app.type(await app.waitForXPath("//input[@placeholder='タイトル']", 10_000), "買い物");
  await app.type(await app.find(".ProseMirror"), "牛乳と卵");

  // 1. 設定から、GitHub のプラグインを取り込む。
  await app.click(await app.findByXPath("//button[@aria-label='設定']"));
  await app.click(await app.waitForXPath("//nav[@aria-label='設定のページ']//button[normalize-space()='プラグイン']", 10_000));
  await app.type(await app.waitForXPath("//input[@id='plugin-source']", 10_000), pluginSource);
  await app.click(await app.findByXPath("//button[normalize-space()='取ってくる']"));
  await app.waitForXPath("//div[@role='dialog']//button[normalize-space()='入れる']", 60_000);
  await capture("linux-plugin-review");
  await app.click(await app.findByXPath("//div[@role='dialog']//button[normalize-space()='入れる']"));
  await app.waitForXPath("//ul[contains(@class,'plugin-list')]/li", 15_000);
  console.log("ok: the plugin was fetched from GitHub and installed");

  // 2. メモのメニューから、コマンドを実行する。知らせ（文字数）が出れば、ワーカーの中の WebAssembly が動いている。
  await app.click(await app.findByXPath("//div[@role='tab'][contains(., '買い物')]"));
  await app.click(await app.waitForXPath("(//button[@aria-label='その他の操作'])[last()]", 10_000));
  await app.click(await app.waitForXPath("//button[@role='menuitem'][contains(normalize-space(), 'Count characters')]", 10_000));
  const message = await waitUntil("the message from the plugin", () => runInPage("return [...document.querySelectorAll('[role=status]')].map((element) => element.textContent).join('|')"),
    (text) => /characters/.test(text));
  await capture("linux-plugin-message");
  console.log(`ok: the plugin command ran in the app (${message})`);
} finally {
  await app.end().catch(() => undefined);
}

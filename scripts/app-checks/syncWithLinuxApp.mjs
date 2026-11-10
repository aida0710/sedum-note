// Linux 版のアプリ（deb を入れたコンテナの中）と手元のブラウザで、両方向の同期を確かめる。
// アプリは tauri-driver（WebKitWebDriver）で操作する。手で流す確認の道具。
//
// 前提: integration/s3-up.sh、`npx vite --host 127.0.0.1 --port 5173`、scripts/app-checks/linux/ の
// コンテナで tauri-driver を 127.0.0.1:14444 に開いておく（README は linux/run-driver.sh）。
//
// 使い方: node scripts/app-checks/syncWithLinuxApp.mjs <画像を置くフォルダ>

import { writeFileSync } from "node:fs";
import { expectNoteFromApp, newCheckRemoteConfig, PASSPHRASE, REMOTE_FIELDS, startBrowserDevice } from "./checkDevices.mjs";
import { WebDriverSession } from "./webDriverSession.mjs";

const outputDirectory = process.argv[2];
const remote = await newCheckRemoteConfig();
const laptop = await startBrowserDevice(remote);

const app = await WebDriverSession.start("http://127.0.0.1:14444", {
  browserName: "wry",
  "tauri:options": { application: "/usr/bin/memo-app" },
});
try {
  await app.click(await app.waitForXPath("//button[normalize-space()='既存のメモに参加']", 30_000));
  await app.type(await app.find("#setup-passphrase"), PASSPHRASE);
  for (const [, inputId, field] of REMOTE_FIELDS) {
    const input = await app.find(`#${inputId}`);
    await app.command("POST", `/element/${input}/clear`, {});
    await app.type(input, remote[field]);
  }
  await app.click(await app.findByXPath("//button[normalize-space()='参加']"));
  await app.waitForXPath("//button[contains(., 'PCで書いたメモ')]", 30_000);
  writeFileSync(`${outputDirectory}/linux-app-list.png`, await app.screenshotPng());

  await app.click(await app.findByXPath("//button[normalize-space()='新しいメモ']"));
  await app.type(await app.waitForXPath("//input[@placeholder='タイトル']", 10_000), "アプリで書いたメモ");
  await app.type(await app.find(".ProseMirror"), "Linuxのアプリから同期");
  await new Promise((resolve) => setTimeout(resolve, 4_000));
  writeFileSync(`${outputDirectory}/linux-app-editor.png`, await app.screenshotPng());

  await expectNoteFromApp(laptop.page, `${outputDirectory}/browser-after-linux-app.png`);
  console.log("both directions synced");
} finally {
  await app.end().catch(() => undefined);
  await laptop.browser.close();
}

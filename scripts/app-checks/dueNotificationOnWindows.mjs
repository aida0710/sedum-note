// Windows の試験用の VM に入れたアプリで、期限の通知と常駐を確かめる。手で流す確認の道具。
// 常駐を切っていればウィンドウを閉じると終了すること、入れていれば閉じても動いたままで、
// 閉じている間に期限が来た項目の通知が出ることを見る。通知と、通知の領域のアイコンは、撮った画面を見て確かめる。
//
// 前提: windowsVm.mjs の先頭のとおり。アプリをインストーラーでも入れておく（通知を画面に出すため）。
// 使い方: WINDOWS_VM_SSH_KEY=... WINDOWS_VM_USER=... node scripts/app-checks/dueNotificationOnWindows.mjs <画像を置くフォルダ>

import { PASSPHRASE } from "./checkDevices.mjs";
import { appToasts, captureScreen, closeMainWindow, isAppRunning, openFromTrayIcon, pause, startApp } from "./windowsVm.mjs";

// 期限を、今から何分後にするか。ウィンドウを閉じてから通知までを待てる長さにする。
const DUE_AFTER_MINUTES = 3;
// 通知が画面に出ているのは数秒なので、出たらすぐ撮れるよう、短い間隔で見る。
const WAIT_STEP_MILLISECONDS = 500;
const MAX_WAIT_MILLISECONDS = 6 * 60_000;
const NOTIFIED_KEYS_STORAGE_KEY = "sedum-note:notifiedDueKeys";

const outputDirectory = process.argv[2];

async function waitUntilAppStops() {
  const deadline = Date.now() + 20_000;
  while (isAppRunning()) {
    if (Date.now() > deadline) {
      throw new Error("the app kept running after its window was closed although it is not set to stay resident");
    }
    await pause(1_000);
  }
}

// 1. 常駐を切っていれば（最初の設定）、ウィンドウを閉じると終了する。
let { browser, page: app } = await startApp({ fresh: true });
await app.evaluate(`localStorage.setItem("sedum-note:devicePreferences", JSON.stringify({ language: "ja", checkForUpdates: false }))`);
await app.reload();
await app.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
await app.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
await app.getByRole("button", { name: "作成" }).click();
await app.getByRole("button", { name: "新しいメモ", exact: true }).waitFor();
await browser.close();
closeMainWindow();
await waitUntilAppStops();
console.log("ok: closing the window quits the app when it is not set to stay resident");

// 2. 期限の通知を入れる。入れたときに、確かめの通知が出る。
({ browser, page: app } = await startApp({ fresh: false }));
await app.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
await app.getByRole("button", { name: "解除" }).click();
await app.getByRole("button", { name: "設定", exact: true }).click();
await app.getByRole("button", { name: "一般", exact: true }).click();
await app.getByLabel("期限が来たら通知する").click();
await app.getByLabel("期限が来たら通知する").and(app.locator(":checked")).waitFor();
captureScreen(outputDirectory, "windows-notifications-turned-on");
console.log("ok: due notifications are turned on");

// 3. 常駐を入れる。通知の領域にアイコンが出る。
await app.getByLabel("ウィンドウを閉じても、アプリを動かしたままにする").click();
await pause(2_000);
captureScreen(outputDirectory, "windows-resident-turned-on");

// 4. 期限の印が付いた項目を書く。期限は、VM の時計で数える。
const dueAt = await app.evaluate((minutes) => {
  const due = new Date(Date.now() + minutes * 60_000);
  const twoDigits = (value) => String(value).padStart(2, "0");
  return `${due.getFullYear()}-${twoDigits(due.getMonth() + 1)}-${twoDigits(due.getDate())} ${twoDigits(due.getHours())}:${twoDigits(due.getMinutes())}`;
}, DUE_AFTER_MINUTES);
await app.keyboard.press("Escape");
await app.getByRole("button", { name: "新しいメモ", exact: true }).click();
await app.getByPlaceholder("タイトル").fill("買い物");
await app.getByPlaceholder("タイトル").press("Enter");
await app.keyboard.type(`[ ] 牛乳を買う 📅 ${dueAt}`);
// 印の文字は大きさ 0 にして、代わりのアイコンを描いているので、見えるかではなく、あるかを待つ。
await app.locator(".ProseMirror .due-mark-icon").waitFor({ state: "attached" });
captureScreen(outputDirectory, "windows-task-with-due-mark");

// 5. ウィンドウを閉じる。常駐を入れているので、アプリは動いたままになる。
closeMainWindow();
await pause(3_000);
if (!isAppRunning()) {
  throw new Error("the app quit when its window was closed although it is set to stay resident");
}
captureScreen(outputDirectory, "windows-window-closed");
console.log("ok: the app keeps running after its window is closed");

// 6. 閉じている間に期限が来て、通知が出る。アプリが知らせた期限を覚えるのを待ってから、画面を撮る。
const notifiedKeys = () => app.evaluate((key) => localStorage.getItem(key) ?? "[]", NOTIFIED_KEYS_STORAGE_KEY);
let waited = 0;
while (!(await notifiedKeys()).includes(dueAt.replace(" ", "T"))) {
  if (waited >= MAX_WAIT_MILLISECONDS) {
    throw new Error(`the app did not notify within ${MAX_WAIT_MILLISECONDS / 60_000} minutes (due ${dueAt})`);
  }
  await pause(WAIT_STEP_MILLISECONDS);
  waited += WAIT_STEP_MILLISECONDS;
}
captureScreen(outputDirectory, "windows-notification-while-closed");
if (!appToasts(outputDirectory).includes("牛乳を買う")) {
  throw new Error("the notification is not in the notification list of Windows");
}
console.log(`ok: the notification for the item due ${dueAt} appeared while the window was closed (waited ${waited / 1000}s)`);

// 7. 通知の領域のアイコンから、ウィンドウを開き直す。
openFromTrayIcon();
await app.waitForFunction(() => document.visibilityState === "visible");
await pause(1_000);
captureScreen(outputDirectory, "windows-reopened-from-icon");
console.log("ok: the window comes back from the icon in the notification area");
await browser.close();

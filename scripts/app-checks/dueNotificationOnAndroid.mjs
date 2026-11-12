// Android のエミュレーターに入れたアプリ（デバッグ版）で、期限の通知が OS に予約され、アプリを裏に回していても
// その時刻に出ることを見る。手で流す確認の道具。画像と、OS の通知の一覧を見て確かめる。
//
// 前提: エミュレーターにデバッグ版の APK（パッケージは com.github.aida0710.sedumnote.debug）を入れ、初回の画面のまま起動しておく。
//   adb shell am start -n com.github.aida0710.sedumnote.debug/com.github.aida0710.sedumnote.MainActivity
//   adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>
// 使い方: ANDROID_HOME=... node scripts/app-checks/dueNotificationOnAndroid.mjs <画像を置くフォルダ>

import { chromium } from "@playwright/test";
import { captureScreen as captureDeviceScreen, pause, shell } from "./androidDevice.mjs";
import { PASSPHRASE } from "./checkDevices.mjs";

const APP_PACKAGE = "com.github.aida0710.sedumnote.debug";
// 期限を、今から何分後にするか。予約から通知までを待てる長さで、分の境目をまたいでも過ぎない長さにする。
const DUE_AFTER_MINUTES = 2;
const WAIT_STEP_MILLISECONDS = 5_000;
const MAX_WAIT_MILLISECONDS = 5 * 60_000;

// 画面の部品の一覧を置く、端末の中の場所。
const SCREEN_ELEMENTS_FILE = "/sdcard/sedum-note-screen-elements.xml";

// いま出ている画面（ほかのアプリの画面も含む）の部品の一覧。
function screenElements() {
  shell("uiautomator", "dump", SCREEN_ELEMENTS_FILE);
  return shell("cat", SCREEN_ELEMENTS_FILE);
}

const outputDirectory = process.argv[2];
const captureScreen = (name) => captureDeviceScreen(outputDirectory, name);

// 標準の設定（画面の大きさなど）を WebView に押し付けないよう noDefaults を付ける。
const browser = await chromium.connectOverCDP("http://127.0.0.1:9333", { noDefaults: true });
const app = browser.contexts()[0].pages()[0];
app.setDefaultTimeout(30_000);

// エミュレーターのアプリは英語の画面になるので、日本語にする。
await app.evaluate(`localStorage.setItem("sedum-note:devicePreferences", JSON.stringify({ language: "ja", checkForUpdates: false }))`);
await app.reload();
await app.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
await app.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
await app.getByRole("button", { name: "作成" }).click();

// 1. 設定で期限の通知を入れる。初めて入れるときに、OS が通知の許可を聞く。
await app.getByRole("button", { name: "設定", exact: true }).click();
await app.getByRole("button", { name: "一般", exact: true }).click();
await app.getByLabel("期限が来たら通知する").click();
await pause(2_000);
captureScreen("notification-permission");
// 許可のダイアログは別のアプリの画面なので、ページの中からは押せない。画面の部品の一覧から「Allow」の位置を読んで押す。
const allowButton = /text="Allow"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(screenElements());
if (!allowButton) {
  throw new Error("the OS did not ask for the notification permission");
}
const [left, top, right, bottom] = allowButton.slice(1).map(Number);
shell("input", "tap", String((left + right) / 2), String((top + bottom) / 2));
await app.getByLabel("期限が来たら通知する").and(app.locator(":checked")).waitFor();
captureScreen("due-notifications-on");
console.log("ok: due notifications are turned on");

// 2. 期限の印が付いた項目を書く。期限は、エミュレーターの時計で数える。
const dueAt = await app.evaluate((minutes) => {
  const due = new Date(Date.now() + minutes * 60_000);
  const twoDigits = (value) => String(value).padStart(2, "0");
  return `${due.getFullYear()}-${twoDigits(due.getMonth() + 1)}-${twoDigits(due.getDate())} ${twoDigits(due.getHours())}:${twoDigits(due.getMinutes())}`;
}, DUE_AFTER_MINUTES + 1);
await app.getByRole("button", { name: "メモ", exact: true }).click();
await app.getByRole("button", { name: "新しいメモ" }).click();
await app.getByPlaceholder("タイトル").fill("買い物");
await app.getByPlaceholder("タイトル").press("Enter");
await app.keyboard.type(`[ ] 牛乳を買う 📅 ${dueAt}`);
await app.locator(".ProseMirror .due-mark-icon").waitFor();
captureScreen("task-with-due-mark");
await app.getByRole("button", { name: "戻る" }).click();
await pause(2_000);
const alarms = shell("dumpsys", "alarm").split("\n").filter((line) => line.includes(APP_PACKAGE) && line.includes("TimedNotificationPublisher"));
console.log(`scheduled alarms for the app: ${alarms.length}`);
if (alarms.length === 0) {
  throw new Error("no notification is scheduled with the OS");
}

// 3. アプリを裏に回して、期限の時刻を待つ。
shell("input", "keyevent", "KEYCODE_HOME");
const postedNotification = () => shell("dumpsys", "notification", "--noredact").split("\n").find((line) => line.includes("牛乳を買う")) ?? null;
let waited = 0;
while (postedNotification() === null) {
  if (waited >= MAX_WAIT_MILLISECONDS) {
    throw new Error(`the notification did not appear within ${MAX_WAIT_MILLISECONDS / 60_000} minutes (due ${dueAt})`);
  }
  await pause(WAIT_STEP_MILLISECONDS);
  waited += WAIT_STEP_MILLISECONDS;
}
shell("cmd", "statusbar", "expand-notifications");
await pause(2_000);
captureScreen("notification-shown");
shell("cmd", "statusbar", "collapse");
console.log(`ok: the notification for the item due ${dueAt} appeared while the app was in the background (waited ${waited / 1000}s)`);
await browser.close();

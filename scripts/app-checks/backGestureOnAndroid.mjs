// Android のエミュレーターに入れたアプリ（デバッグ版）で、端末の「戻る」（KEYCODE_BACK）が、開いているメニューや
// ダイアログ（AI チャット）だけを閉じ、下のメモを閉じないかを見る。ブラウザの試験の page.goBack() は、WebView の
// 「戻る」と同じ道を通らないので、実際のキーで確かめる。手で流す確認の道具。
//
// 前提: editorFeaturesOnAndroid.mjs と同じ（デバッグ版を初回の画面のまま起動し、DevTools の口を 9333 へ forward しておく）。
// 使い方: ANDROID_HOME=... node scripts/app-checks/backGestureOnAndroid.mjs <画像を置くフォルダ>

import { chromium } from "@playwright/test";
import { captureScreen as captureDeviceScreen, pause, shell } from "./androidDevice.mjs";
import { PASSPHRASE } from "./checkDevices.mjs";

const outputDirectory = process.argv[2];
const captureScreen = (name) => captureDeviceScreen(outputDirectory, name);

const browser = await chromium.connectOverCDP("http://127.0.0.1:9333", { noDefaults: true });
const app = browser.contexts()[0].pages()[0];
app.setDefaultTimeout(30_000);

await app.evaluate(`localStorage.setItem("sedum-note:devicePreferences", JSON.stringify({ language: "ja", checkForUpdates: false }))`);
await app.reload();
await app.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
await app.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
await app.getByRole("button", { name: "作成" }).click();

await app.getByRole("button", { name: "新しいメモ" }).click();
await app.getByPlaceholder("タイトル").fill("戻るの確認");
await app.getByPlaceholder("タイトル").press("Enter");

const pressBack = async () => {
  shell("input", "keyevent", "KEYCODE_BACK");
  await pause(800);
};
const noteIsOpen = async () => (await app.getByPlaceholder("タイトル").count()) === 1;
const results = [];
const record = async (label, passed) => {
  results.push(`${passed ? "OK" : "NG"} ${label}`);
};

// キーボードが出ていると、最初の「戻る」はキーボードを閉じるだけなので、先にフォーカスを外す。
await app.evaluate("document.activeElement?.blur()");
await pause(500);

// 1. メニューを開いて「戻る」。
await app.getByRole("button", { name: "その他の操作" }).click();
await app.getByRole("menu").waitFor();
await captureScreen("1-menu-open");
await pressBack();
await record("メニューで「戻る」: メニューが閉じる", (await app.getByRole("menu").count()) === 0);
await record("メニューで「戻る」: メモは開いたまま", await noteIsOpen());

// 2. AI チャットを開いて「戻る」。
await app.getByRole("button", { name: "その他の操作" }).click();
await app.getByRole("menuitem", { name: "AIチャット" }).click();
await app.getByRole("dialog", { name: "AIチャット" }).waitFor();
await app.evaluate("document.activeElement?.blur()");
await pause(500);
await captureScreen("2-chat-open");
await pressBack();
await captureScreen("3-after-back-from-chat");
await record("AI チャットで「戻る」: チャットが閉じる", (await app.getByRole("dialog").count()) === 0);
await record("AI チャットで「戻る」: メモは開いたまま", await noteIsOpen());

// 3. もう一度「戻る」で、メモを閉じて一覧へ。
await pressBack();
await captureScreen("4-after-second-back");
await record("もう一度「戻る」: メモを閉じる", !(await noteIsOpen()));

console.log(results.join("\n"));
await browser.close();

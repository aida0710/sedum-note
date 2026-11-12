// Android のエミュレーターに入れたアプリ（デバッグ版）で、エディタの機能のうち、ブラウザの試験では確かめられない所を見る:
// スマホの画面での「/」からのブロックへのリンクと埋め込み、AI チャットのダイアログ、録音を始めたときのマイクの許可。
// 手で流す確認の道具。画像を見て確かめる。
//
// 前提: エミュレーターにデバッグ版の APK（パッケージは com.github.aida0710.sedumnote.debug）を入れ、初回の画面のまま起動しておく。
//   adb shell am start -n com.github.aida0710.sedumnote.debug/com.github.aida0710.sedumnote.MainActivity
//   adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>
// 使い方: ANDROID_HOME=... node scripts/app-checks/editorFeaturesOnAndroid.mjs <画像を置くフォルダ>

import { chromium } from "@playwright/test";
import { captureScreen as captureDeviceScreen, pause, shell } from "./androidDevice.mjs";
import { PASSPHRASE } from "./checkDevices.mjs";

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

async function createNote(title) {
  await app.getByRole("button", { name: "新しいメモ" }).click();
  await app.getByPlaceholder("タイトル").fill(title);
  await app.getByPlaceholder("タイトル").press("Enter");
}

// 1. 元になるメモ。
await createNote("旅行の計画");
await app.keyboard.type("出発は 8 月 3 日の朝。");
await app.keyboard.press("Enter");
await app.keyboard.type("宿は駅前のホテル");
await app.getByRole("button", { name: "戻る" }).click();

// 2. 「/」から、ブロックへのリンクと埋め込みを入れる。
await createNote("持ち物");
await app.keyboard.type("/ぶろっく");
await app.getByRole("option", { name: "ブロックへのリンク" }).click();
await app.getByRole("dialog").getByRole("button", { name: "旅行の計画" }).click();
captureScreen("block-picker");
await app.getByRole("dialog").getByRole("button", { name: "出発は 8 月 3 日の朝。" }).click();
await app.keyboard.press("Enter");
await app.keyboard.type("/うめこみ");
await app.getByRole("option", { name: /ブロックの埋め込み/ }).click();
await app.getByRole("dialog").getByRole("button", { name: "旅行の計画" }).click();
await app.getByRole("dialog").getByRole("button", { name: "宿は駅前のホテル" }).click();
await app.locator(".block-embed .ProseMirror").getByText("宿は駅前のホテル").waitFor();
captureScreen("block-link-and-embed");
console.log("ok: a block link and a block embed are inserted from the slash menu");

// 3. AI チャットのダイアログ（AI は有効にしていないので、案内が出る）。
await app.getByRole("button", { name: "その他の操作" }).last().click();
await app.getByRole("menuitem", { name: "AI チャット" }).click();
await app.getByRole("region", { name: "AI チャット" }).waitFor();
captureScreen("ai-chat-dialog");
await app.getByRole("button", { name: "AI チャットを閉じる" }).click();
console.log("ok: the AI chat dialog opens");

// 4. 録音。初めて使うときに、マイクの許可を聞かれる。
await app.locator(".ProseMirror").first().click();
await app.getByRole("button", { name: "録音する" }).click();
// 許可のダイアログは別のアプリの画面なので、ページの中からは見えない。前面の画面の名前で待つ。
const topActivity = () => shell("dumpsys", "activity", "activities").split("\n").find((line) => line.includes("topResumedActivity")) ?? "";
const PERMISSION_WAIT_MILLISECONDS = 15_000;
const deadline = Date.now() + PERMISSION_WAIT_MILLISECONDS;
while (!topActivity().includes("GrantPermissionsActivity")) {
  if (Date.now() > deadline) {
    throw new Error(`the microphone permission dialog did not open: ${topActivity().trim()}`);
  }
  await pause(500);
}
captureScreen("recording-permission");
console.log("ok: starting a recording asks for the microphone permission");
process.exit(0);

// Android のエミュレーターに入れたアプリが、CORS でアプリの origin を許していないバケットへ同期できるかを確かめる。
// アプリは同期先への要求をアプリの側（Rust）から送るので、バケットの CORS の設定に関わらずつながるはず。手で流す確認の道具。
//
// 前提: integration/s3-up.sh、`adb reverse tcp:18333 tcp:18333`。配布用の APK を入れ、初回の画面のまま起動しておく。
// 使い方: ANDROID_HOME=... node scripts/app-checks/syncWithoutCorsFromAndroidApp.mjs <画像を置くフォルダ>

import { captureScreen, connectToApp, pause } from "./androidDevice.mjs";
import { hasVaultAndRecord, prepareBucketRefusingAppOrigin } from "./bucketRefusingAppOrigin.mjs";
import { PASSPHRASE, REMOTE_FIELDS } from "./checkDevices.mjs";

const outputDirectory = process.argv[2];
// 編集の 2 秒後に送るので、それより長く待つ。
const SYNC_WAIT_MILLISECONDS = 30_000;
const { remote, listStoredKeys } = await prepareBucketRefusingAppOrigin();

// エミュレーターの言語は英語なので、道具が使う日本語の文言にそろえる。
const app = await connectToApp();
await app.evaluate(`localStorage.setItem("sedum-note:devicePreferences", JSON.stringify({ language: "ja", checkForUpdates: false }))`);
await app.reload();
await pause(2_000);
await app.fillByLabel("パスフレーズ", PASSPHRASE);
await app.fillByLabel("パスフレーズ（確認）", PASSPHRASE);
await app.evaluate(`[...document.querySelectorAll("label")].find((label) => label.textContent.includes("ほかのデバイスと同期する")).querySelector("input").click()`);
for (const [label, , field] of REMOTE_FIELDS) {
  await app.fillByLabel(label, remote[field]);
}
await app.clickButton("作成");
// 新しいメモのボタンは画面に固定されていて、clickButton の「見えているか」の判定（offsetParent）に掛からない。
const newNoteButton = `document.querySelector('button[aria-label="新しいメモ"]')`;
await app.waitFor("the new note button", `Boolean(${newNoteButton})`, 60_000);
await app.evaluate(`${newNoteButton}.click()`);
await app.fillBySelector(".title-input", "CORS なしで同期したメモ");

const deadline = Date.now() + SYNC_WAIT_MILLISECONDS;
let keys = await listStoredKeys();
while (!hasVaultAndRecord(keys) && Date.now() < deadline) {
  await pause(1_000);
  keys = await listStoredKeys();
}
captureScreen(outputDirectory, "android-sync-without-cors");
app.close();
if (!hasVaultAndRecord(keys)) {
  throw new Error(`the vault and the note were not written to the storage: ${keys.join(", ")}`);
}
console.log(`ok: the Android app synced to a bucket that does not allow its origin (${keys.length} objects)`);

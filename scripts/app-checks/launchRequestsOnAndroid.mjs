// Android のエミュレーターに入れたアプリで、「新しいメモ」の頼まれごと（ウィジェットとショートカットが送る Intent）と、
// カメラのボタンを確かめる。手で流す確認の道具。配布用（最適化あり）の APK で流す。
//
// 前提: shareToAndroidApp.mjs を流したあと（vault があり、ロックを解除して、一覧が出ている）。
// 使い方: ANDROID_HOME=... node scripts/app-checks/launchRequestsOnAndroid.mjs <画像を置くフォルダ>

import { APP_PACKAGE, captureScreen as captureDeviceScreen, connectToApp, pause, shell } from "./androidDevice.mjs";
import { PASSPHRASE } from "./checkDevices.mjs";

const outputDirectory = process.argv[2];
const captureScreen = (name) => captureDeviceScreen(outputDirectory, name);
const NOTE_COUNT = `document.querySelectorAll(".note-item").length`;

const requestNewNote = () => shell("am", "start", "-a", `${APP_PACKAGE}.action.NEW_NOTE`, "-n", `${APP_PACKAGE}/.MainActivity`);

async function expectEmptyNoteOpen(app, description) {
  await app.waitFor(description, `document.querySelector(".title-input")?.value === "" && Boolean(document.querySelector(".ProseMirror"))`);
  console.log(`ok: ${description}`);
}

// 1. アプリを開いたまま「新しいメモ」を頼む。
let app = await connectToApp();
const notesBefore = await app.evaluate(NOTE_COUNT);
requestNewNote();
await expectEmptyNoteOpen(app, "a new note opens when the request arrives while the app is open");
await app.clickButton("戻る");
await app.waitFor("one more note in the list", `${NOTE_COUNT} === ${notesBefore + 1}`);

// 2. アプリを止めた状態で頼む。ロックを解除すると、新しいメモが開く。
app.close();
shell("am", "force-stop", APP_PACKAGE);
requestNewNote();
await pause(8_000);
app = await connectToApp();
await app.waitForText("ロックを解除");
await app.fillByLabel("パスフレーズ", PASSPHRASE);
await app.clickButton("解除");
await expectEmptyNoteOpen(app, "a new note opens after unlocking when the request arrived while the app was stopped");
captureScreen("new-note-from-shortcut");

// 3. カメラのボタンが、カメラを開く。
await app.clickButton("カメラで撮る");
await pause(4_000);
const top = shell("dumpsys", "activity", "activities").split("\n").find((line) => line.includes("topResumedActivity")) ?? "";
if (!/camera/i.test(top)) {
  throw new Error(`the camera did not open: ${top.trim()}`);
}
console.log(`ok: the camera button opens the camera (${/u0 ([^ ]+)/.exec(top)?.[1]})`);
captureScreen("camera-opened");
process.exit(0);

// Android のエミュレーターに入れたアプリへ、ほかのアプリの「共有」と同じ Intent を送り、
// 新しいメモになるかを確かめる。手で流す確認の道具で、CI では流さない。配布用（最適化あり）の
// APK で流す（デバッグ版では、最適化で画面との橋が消えていても気づけない）。
//
// 前提: アプリを入れた直後の、初回の画面のまま起動しておく。
// 使い方: ANDROID_HOME=... node scripts/app-checks/shareToAndroidApp.mjs <画像を置くフォルダ>
//
// 確かめること:
//   1. ロック中に共有された文字は、ロックを解除するまでメモにならず、解除するとメモになって開く
//   2. 写真の共有は、写真を貼ったメモになる。読めない写真は、添付できなかったことを書いたメモになる
//   3. アプリを止めた状態で共有されても、起動してロックを解除するとメモになる

import { APP_PACKAGE, captureScreen as captureDeviceScreen, connectToApp, pause, shell } from "./androidDevice.mjs";
import { PASSPHRASE } from "./checkDevices.mjs";

const outputDirectory = process.argv[2];
const captureScreen = (name) => captureDeviceScreen(outputDirectory, name);
// 1x1 の PNG。読めないファイルの共有に使う。
const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const TITLE_VALUE = `document.querySelector(".title-input")?.value`;

function shareText(subject, text) {
  shell("am", "start", "-a", "android.intent.action.SEND", "-t", "text/plain",
    "--es", "android.intent.extra.SUBJECT", `'${subject}'`, "--es", "android.intent.extra.TEXT", `'${text}'`,
    "-n", `${APP_PACKAGE}/.MainActivity`);
}

async function unlock(app) {
  await app.fillByLabel("パスフレーズ", PASSPHRASE);
  await app.clickButton("解除");
}

async function expectOpenNoteTitled(app, title) {
  await app.waitFor(`the open note titled ${title}`, `${TITLE_VALUE} === ${JSON.stringify(title)}`);
}

// エミュレーターの言語は英語なので、道具が使う日本語の文言にそろえる。
let app = await connectToApp();
await app.evaluate(`localStorage.setItem("sedum-note:devicePreferences", JSON.stringify({ language: "ja" }))`);
await app.reload();
await pause(2_000);
await app.fillByLabel("パスフレーズ", PASSPHRASE);
await app.fillByLabel("パスフレーズ（確認）", PASSPHRASE);
await app.clickButton("作成");
await app.clickButton("設定");
await app.clickButton("ロック");
await app.waitForText("ロックを解除");

// 1. ロック中の共有。
shareText("共有の件名", "ロック中に共有した文 https://example.com/article");
await pause(3_000);
if (!(await app.evaluate(`document.body.innerText.includes("ロックを解除")`))) {
  throw new Error("the app left the unlock screen without the passphrase");
}
await unlock(app);
await expectOpenNoteTitled(app, "共有の件名");
await app.waitFor("the shared link in the note", `Boolean(document.querySelector(".ProseMirror a[href='https://example.com/article']"))`);
captureScreen("share-text-after-unlock");
await app.clickButton("戻る");

// 2. アプリを開いたままの、写真の共有。adb からは、ほかのアプリのファイルを読む許可を付けて共有できないので、
// 誰でも読める場所（このアプリ自身のアイコンのリソース）を共有する。
const sharePicture = (uri) => shell("am", "start", "-a", "android.intent.action.SEND", "-t", "image/png",
  "--eu", "android.intent.extra.STREAM", uri, "-n", `${APP_PACKAGE}/.MainActivity`);
sharePicture(`android.resource://${APP_PACKAGE}/mipmap/ic_launcher`);
await expectOpenNoteTitled(app, "ic_launcher");
await app.waitFor("the shared picture in the note", `Boolean(document.querySelector(".attachment-image img"))`);
captureScreen("share-picture");
await app.clickButton("戻る");

// 読む許可の無いファイルを共有されても止まらず、添付できなかったことを書いたメモになる。
shell(`echo ${TINY_PNG_BASE64} | base64 -d > /sdcard/Pictures/sedum-note-share.png`);
shell("am", "broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE", "-d", "file:///sdcard/Pictures/sedum-note-share.png");
await pause(3_000);
const mediaRow = shell("content", "query", "--uri", "content://media/external/images/media", "--projection", "_id:_display_name")
  .split("\n").find((row) => row.includes("sedum-note-share.png"));
const mediaId = /_id=(\d+)/.exec(mediaRow ?? "")?.[1];
if (!mediaId) {
  throw new Error("the picture was not registered in the media store");
}
sharePicture(`content://media/external/images/media/${mediaId}`);
await app.waitForText("は添付できませんでした");
captureScreen("share-unreadable-picture");
await pause(1_000);

// 3. アプリを止めた状態での共有。
app.close();
shell("am", "force-stop", APP_PACKAGE);
shareText("", "止まっている間に共有した文");
await pause(8_000);
app = await connectToApp();
await unlock(app);
await expectOpenNoteTitled(app, "止まっている間に共有した文");
await app.clickButton("戻る");
await pause(1_000);
const titles = await app.evaluate(`[...document.querySelectorAll(".note-item h3")].map((heading) => heading.textContent)`);
captureScreen("share-list");
console.log(`shared content became notes: ${titles.join(" / ")}`);
process.exit(0);

// Android のエミュレーターに入れたアプリが、カメラで同期の設定の QR を読んで参加できるかを確かめる。
// 手で流す確認の道具で、CI では流さない。2 回に分けて使う。
//
// 1. QR を作る:  node scripts/app-checks/syncSetupQrOnAndroid.mjs prepare <フォルダ>
//    手元のブラウザで同期するメモを作り、同期の設定を書き出して、QR を <フォルダ>/sync-setup-qr.png に置く。
//    前提: integration/s3-up.sh、`npx vite --host 127.0.0.1 --port 5173`。
// 2. エミュレーターを、その画像を背面のカメラに写して起動する（-camera-back imagefile:<フォルダ>/sync-setup-qr.png）。
//    配布用の APK を入れ、`adb reverse tcp:18333 tcp:18333` のあと、初回の画面のまま起動しておく。
// 3. 読ませる:  ANDROID_HOME=... node scripts/app-checks/syncSetupQrOnAndroid.mjs scan <フォルダ>
//    アプリで「カメラで QR を読む」を押し、カメラの許可の確認に答え、暗号化キーを入れて参加する。

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { captureScreen, connectToApp, pause, shell } from "./androidDevice.mjs";
import { newCheckRemoteConfig, PASSPHRASE, startBrowserDevice, SYNC_KEY } from "./checkDevices.mjs";

const [mode, outputDirectory] = process.argv.slice(2);
// 画面の部品の一覧（uiautomator）から、許可のボタンの位置を探すための正規表現。
const ALLOW_BUTTON = /text="(?:While using the app|アプリの使用時のみ)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/;

if (mode === "prepare") {
  const laptop = await startBrowserDevice(await newCheckRemoteConfig());
  await laptop.page.locator(".sync-line").click();
  await laptop.page.getByRole("button", { name: "同期設定をエクスポート" }).click();
  const image = await laptop.page.getByRole("img", { name: "同期の設定の QR コード" }).getAttribute("src");
  // エミュレーターは、横長の画像の左寄りの一部だけを、縦長のカメラの枠に写す。QR だけの画像だと端が切れるので、
  // 4:3 の白い地の、写る範囲に収まる位置に小さめに置いた画像にする。
  const framed = await laptop.page.evaluate(async (source) => {
    const picture = new Image();
    picture.src = source;
    await picture.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 960;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(picture, 140, (canvas.height - 420) / 2, 420, 420);
    return canvas.toDataURL("image/png");
  }, image);
  writeFileSync(`${outputDirectory}/sync-setup-qr.png`, Buffer.from(framed.split(",")[1], "base64"));
  await laptop.page.screenshot({ path: `${outputDirectory}/browser-export.png` });
  await laptop.browser.close();
  console.log(`wrote ${outputDirectory}/sync-setup-qr.png`);
} else if (mode === "scan") {
  const adb = `${process.env.ANDROID_HOME}/platform-tools/adb`;
  const device = process.env.ANDROID_SERIAL ?? "emulator-5580";
  // エミュレーターの言語は英語なので、道具が使う日本語の文言にそろえる。
  let app = await connectToApp();
  await app.evaluate(`localStorage.setItem("sedum-note:devicePreferences", JSON.stringify({ language: "ja", checkForUpdates: false }))`);
  await app.reload();
  await pause(2_000);
  await app.fillByLabel("パスフレーズ", PASSPHRASE);
  await app.fillByLabel("パスフレーズ（確認）", PASSPHRASE);
  await app.evaluate(`[...document.querySelectorAll("label")].find((label) => label.textContent.includes("ほかのデバイスと同期する")).querySelector("input").click()`);
  await app.clickButton("カメラで QR を読む");
  await pause(3_000);
  captureScreen(outputDirectory, "android-camera-permission");
  // 初めて使うので、Android がカメラの許可を聞く。画面の部品の一覧から「アプリの使用時のみ」を探して押す。
  shell("uiautomator", "dump", "/sdcard/window.xml");
  const bounds = ALLOW_BUTTON.exec(shell("cat", "/sdcard/window.xml"));
  if (!bounds) {
    throw new Error("the camera permission dialog did not appear");
  }
  const [left, top, right, bottom] = bounds.slice(1).map(Number);
  execFileSync(adb, ["-s", device, "shell", "input", "tap", String((left + right) / 2), String((top + bottom) / 2)]);
  await app.waitForText("同期の設定を読みました", 30_000);
  captureScreen(outputDirectory, "android-qr-read");
  await app.fillBySelector("#sync-setup-key", SYNC_KEY);
  await app.clickButton("インポート");
  await app.waitForText("既存のメモが見つかりました", 30_000);
  await app.clickButton("参加");
  await app.waitForText("PCで書いたメモ", 60_000);
  captureScreen(outputDirectory, "android-joined-by-qr");
  app.close();
  console.log("ok: the Android app read the QR code with the camera and joined");
} else {
  throw new Error("usage: syncSetupQrOnAndroid.mjs prepare|scan <output directory>");
}

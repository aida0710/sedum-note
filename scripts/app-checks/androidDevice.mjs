// Android のエミュレーターに入れたアプリを、adb と WebView の DevTools から操作するための道具。
// shareToAndroidApp.mjs と launchRequestsOnAndroid.mjs が使う。
//
// 前提: ANDROID_HOME。エミュレーターは ANDROID_SERIAL（既定は emulator-5580）。

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { connectToAppPage } from "./devToolsPage.mjs";

export const APP_PACKAGE = "com.github.aida0710.sedumnote";
const adb = `${process.env.ANDROID_HOME}/platform-tools/adb`;
const device = process.env.ANDROID_SERIAL ?? "emulator-5580";
const DEVTOOLS_PORT = 9333;

export const shell = (...args) => execFileSync(adb, ["-s", device, "shell", ...args], { encoding: "utf8" });

// エミュレーターの画面を adb で撮る（WebView の外のバーやキーボードも写る）。
export function captureScreen(outputDirectory, name) {
  writeFileSync(`${outputDirectory}/${name}.png`, execFileSync(adb, ["-s", device, "exec-out", "screencap", "-p"]));
}

export const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// 起動し直すと WebView の DevTools の口の名前（プロセスの番号つき）が変わるので、そのたびにつなぎ直す。
export function connectToApp() {
  const pid = shell("pidof", APP_PACKAGE).trim();
  execFileSync(adb, ["-s", device, "forward", `tcp:${DEVTOOLS_PORT}`, `localabstract:webview_devtools_remote_${pid}`]);
  return connectToAppPage(DEVTOOLS_PORT);
}

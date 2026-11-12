// Windows の試験用の VM に入れたアプリを、SSH と WebView2 の DevTools から操作するための道具。
// dueNotificationOnWindows.mjs と pluginOnWindows.mjs が使う。
//
// 前提: VM に OpenSSH のサーバーがあり、鍵で入れる。VM の C:\sedum-note-check\ に、scripts/app-checks/windows/ の
// .ps1、scripts/app-checks/startWindowsApp.ps1、CI の確認用のビルド（成果物 sedum-note-Windows-check）の
// sedum-note.exe を置いておく。VM の DevTools（127.0.0.1:9222）を、手元の 127.0.0.1:9334 へつないでおく:
//   ssh -N -L 127.0.0.1:9334:127.0.0.1:9222 <VM>
// つなぎ先は WINDOWS_VM_SSH_PORT・WINDOWS_VM_SSH_KEY・WINDOWS_VM_USER で決める。

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const CHECK_DIRECTORY = "C:\\sedum-note-check";
export const DEVTOOLS_ENDPOINT = "http://127.0.0.1:9334";
const sshPort = process.env.WINDOWS_VM_SSH_PORT ?? "12232";
const sshKey = process.env.WINDOWS_VM_SSH_KEY;
const sshUser = process.env.WINDOWS_VM_USER;
// 試験用の VM は作り直すたびにホストの鍵が変わるので、known_hosts には残さない。
// ポートの渡し方は ssh（-p）と scp（-P）で違うので、-o で渡す。
const SSH_OPTIONS = ["-i", sshKey, "-o", `Port=${sshPort}`, "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "LogLevel=ERROR", "-o", "BatchMode=yes"];

export const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function runOnVm(command) {
  return execFileSync("ssh", [...SSH_OPTIONS, `${sshUser}@127.0.0.1`, command], { encoding: "utf8" });
}

const runPowerShellFile = (name, scriptArguments = "") => runOnVm(`powershell -NoProfile -ExecutionPolicy Bypass -File ${CHECK_DIRECTORY}\\${name} ${scriptArguments}`);

// 利用者の画面の中で、VM に置いた .ps1 を動かす。
const runInDesktopSession = (name) => runPowerShellFile("runInDesktopSession.ps1", `-Script ${CHECK_DIRECTORY}\\${name}`);

// VM の画面の全体を撮る（通知や、通知の領域のアイコンも写る）。
export function captureScreen(outputDirectory, name) {
  runInDesktopSession("captureScreen.ps1");
  copyFromVm("screen.png", `${outputDirectory}/${name}.png`);
}

// VM のファイルを、手元へ写す。
function copyFromVm(name, localPath) {
  execFileSync("scp", [...SSH_OPTIONS, `${sshUser}@127.0.0.1:C:/sedum-note-check/${name}`, localPath]);
}

// アプリが Windows に出した通知（通知の一覧に残っているもの）の中身。
export function appToasts(outputDirectory) {
  runInDesktopSession("listAppToasts.ps1");
  copyFromVm("toasts.txt", `${outputDirectory}/windows-toasts.txt`);
  return readFileSync(`${outputDirectory}/windows-toasts.txt`, "utf8");
}

// 通知の領域の常駐のアイコンを押して、隠したウィンドウを開き直す。
export const openFromTrayIcon = () => runInDesktopSession("openFromTrayIcon.ps1");

// 最初のウィンドウを、利用者が「×」を押したのと同じ形で閉じる。
export const closeMainWindow = () => runInDesktopSession("closeMainWindow.ps1");

export const isAppRunning = () => runOnVm("tasklist /FI \"IMAGENAME eq sedum-note.exe\" /NH").includes("sedum-note.exe");

// アプリを起動して、最初のウィンドウのページにつなぐ。fresh なら、アプリの保存を消してから起動する。
export async function startApp({ fresh }) {
  runPowerShellFile("startWindowsApp.ps1", `-App ${CHECK_DIRECTORY}\\sedum-note.exe${fresh ? " -Fresh" : ""}`);
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      // 標準の設定（画面の大きさなど）を WebView に押し付けないよう noDefaults を付ける。
      const browser = await chromium.connectOverCDP(DEVTOOLS_ENDPOINT, { noDefaults: true });
      const page = browser.contexts()[0]?.pages().find((candidate) => candidate.url().startsWith("http"));
      if (page) {
        page.setDefaultTimeout(30_000);
        return { browser, page };
      }
      await browser.close();
    } catch (error) {
      if (Date.now() > deadline) {
        throw error;
      }
    }
    if (Date.now() > deadline) {
      throw new Error("the app page did not appear in DevTools");
    }
    await pause(1_000);
  }
}

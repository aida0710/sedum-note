// Linux 版のアプリ（deb を入れたコンテナの中）で、ファイルを添付し、保存のダイアログから
// ファイルに書けるかを確かめる。手で流す確認の道具。
//
// 前提: scripts/app-checks/linux/run-driver.sh でコンテナを起動し、コンテナに xdotool を入れ、
// 添付するファイルを /tmp/estimate-source.txt に置いておく。
// 保存のダイアログ（GTK）は WebDriver から触れないので、xdotool で Enter を送って既定の場所に保存する。
//
// 使い方: node scripts/app-checks/saveFileInLinuxApp.mjs <画像を置くフォルダ>

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { PASSPHRASE } from "./checkDevices.mjs";
import { WebDriverSession } from "./webDriverSession.mjs";

const outputDirectory = process.argv[2];
const CONTAINER = "sedum-note-linux-drive";
const inContainer = (command) => execFileSync("docker", ["exec", "-e", "DISPLAY=:99", CONTAINER, "sh", "-c", command]).toString();

const app = await WebDriverSession.start("http://127.0.0.1:14444", {
  browserName: "wry",
  "tauri:options": { application: "/usr/bin/sedum-note" },
});
try {
  await app.type(await app.waitForXPath("//input[@id='setup-passphrase']", 30_000), PASSPHRASE);
  await app.type(await app.find("#setup-passphrase-confirm"), PASSPHRASE);
  await app.click(await app.findByXPath("//button[normalize-space()='作成']"));
  await app.click(await app.waitForXPath("//button[normalize-space()='新しいメモ']", 30_000));
  await app.type(await app.waitForXPath("//input[@placeholder='タイトル']", 10_000), "資料つき");

  // 隠してあるファイルの入力欄は WebDriver から打てないので、見える状態にしてからパスを渡す。
  await app.command("POST", "/execute/sync", {
    script: "document.querySelector('input[type=file]:not([accept])').hidden = false",
    args: [],
  });
  await app.type(await app.find("input[type=file]:not([accept])"), "/tmp/estimate-source.txt");
  await app.waitForXPath("//*[contains(@class,'attachment-file')]", 15_000);
  writeFileSync(`${outputDirectory}/linux-file-node.png`, await app.screenshotPng());

  // 保存のボタンを押すとダイアログが開き、閉じるまで click が返らないことがあるので、画面の側から押す。
  await app.command("POST", "/execute/sync", {
    script: "setTimeout(() => document.querySelector('.attachment-file button').click(), 0)",
    args: [],
  });
  await new Promise((resolve) => setTimeout(resolve, 4_000));
  console.log("windows:", inContainer("xdotool search --onlyvisible --name . getwindowname %@ 2>/dev/null || true").trim());
  inContainer("xdotool key Return");
  await new Promise((resolve) => setTimeout(resolve, 4_000));
  // 既定の場所（アプリの作業フォルダ）に、添付と同じ中身のファイルができているか。
  console.log("saved:", inContainer('for f in $(find / -xdev -name "estimate-source.txt" -not -path "/tmp/*" 2>/dev/null); do echo "$f"; cat "$f"; done').trim());
} finally {
  await app.end().catch(() => undefined);
}

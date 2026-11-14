// Linux 版のアプリ（deb を入れたコンテナの中）で、メモを別のウィンドウで開き、ウィンドウの間で編集とロック・解除が伝わるかを確かめる。
// 手で流す確認の道具。アプリのウィンドウどうしで、BroadcastChannel（ロックを解除したウィンドウのマスターキーの受け渡しも）と
// Web Locks が働くことを見る。
//
// 前提: scripts/app-checks/linux/run-driver.sh（組み立てた実行ファイルなら run-built-app-driver.sh）でコンテナを起動しておく。
// 実行ファイルの場所は APP_PATH で変えられる（run-built-app-driver.sh は /app/sedum-note）。
// 使い方: node scripts/app-checks/noteWindowInLinuxApp.mjs <画像を置くフォルダ>

import { writeFileSync } from "node:fs";
import { PASSPHRASE } from "./checkDevices.mjs";
import { WebDriverSession } from "./webDriverSession.mjs";

const outputDirectory = process.argv[2];
const WAIT_STEP_MILLISECONDS = 500;

const app = await WebDriverSession.start("http://127.0.0.1:14444", {
  browserName: "wry",
  "tauri:options": { application: process.env.APP_PATH ?? "/usr/bin/sedum-note" },
});

const runInPage = (script) => app.command("POST", "/execute/sync", { script, args: [] });
const bodyText = () => runInPage("return document.querySelector('.ProseMirror')?.textContent ?? null");
const windowHandles = () => app.command("GET", "/window/handles");
const switchToWindow = (handle) => app.command("POST", "/window", { handle });
const capture = async (name) => writeFileSync(`${outputDirectory}/${name}.png`, await app.screenshotPng());

// 条件が成り立つまで待つ。成り立たなければ、最後に見た値を付けて失敗する。
async function waitUntil(description, read, isSatisfied, timeoutMilliseconds = 30_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  for (;;) {
    const value = await read();
    if (isSatisfied(value)) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error(`${description}: last value ${JSON.stringify(value)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MILLISECONDS));
  }
}

async function chooseFromNoteMenu(itemName) {
  await app.click(await app.waitForXPath("(//button[@aria-label='その他の操作'])[last()]", 10_000));
  await app.click(await app.waitForXPath(`//button[@role='menuitem' or @role='menuitemcheckbox'][contains(normalize-space(), '${itemName}')]`, 10_000));
}

try {
  // アプリは英語の画面で始まることがあるので、日本語にしてから始める。
  await app.waitForXPath("//input[@id='setup-passphrase']", 30_000);
  await runInPage(`localStorage.setItem("sedum-note:devicePreferences", JSON.stringify({ language: "ja", checkForUpdates: false })); location.reload();`);
  await app.type(await app.waitForXPath("//input[@id='setup-passphrase']", 30_000), PASSPHRASE);
  await app.type(await app.find("#setup-passphrase-confirm"), PASSPHRASE);
  await app.click(await app.findByXPath("//button[normalize-space()='作成']"));
  await app.click(await app.waitForXPath("//button[normalize-space()='新しいメモ']", 30_000));
  await app.type(await app.waitForXPath("//input[@placeholder='タイトル']", 10_000), "買い物");
  await app.type(await app.find(".ProseMirror"), "牛乳");
  await waitUntil("the body of the first window", bodyText, (text) => text === "牛乳");
  const [mainWindow] = await windowHandles();

  // 1. 別のウィンドウで開く。最初のウィンドウのキーを受け取り、パスフレーズを聞かずに、そのメモだけが出る。
  await chooseFromNoteMenu("別のウィンドウで開く");
  const handles = await waitUntil("a second window", windowHandles, (list) => list.length === 2);
  const noteWindow = handles.find((handle) => handle !== mainWindow);
  await switchToWindow(noteWindow);
  await waitUntil("the body of the note window", bodyText, (text) => text === "牛乳");
  await capture("linux-note-window");
  console.log("ok: the note opens in a second window without asking for the passphrase");

  // 2. 別のウィンドウで書いた文字が、最初のウィンドウに出る。
  await app.type(await app.find(".ProseMirror"), "と卵");
  await switchToWindow(mainWindow);
  const merged = await waitUntil("the text typed in the note window to reach the first window", bodyText, (text) => text?.includes("卵"));
  await capture("linux-main-window-after-edit");
  console.log(`ok: text typed in the note window reached the first window (${merged})`);

  // 3. ウィンドウを最前面に固定できる（権限と、アプリの側の呼び出しが通ること）。
  await switchToWindow(noteWindow);
  await chooseFromNoteMenu("ウィンドウを最前面に固定");
  await app.click(await app.waitForXPath("(//button[@aria-label='その他の操作'])[last()]", 10_000));
  await app.waitForXPath("//button[@role='menuitemcheckbox'][@aria-checked='true'][contains(normalize-space(), 'ウィンドウを最前面に固定')]", 10_000);
  await capture("linux-note-window-on-top");
  console.log("ok: the note window is kept on top");

  // 4. 最初のウィンドウでロックすると、別のウィンドウもロックされる。
  await switchToWindow(mainWindow);
  await runInPage(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "l", code: "KeyL", ctrlKey: true, bubbles: true }))`);
  await app.waitForXPath("//input[@id='unlock-passphrase']", 15_000);
  await switchToWindow(noteWindow);
  await app.waitForXPath("//input[@id='unlock-passphrase']", 15_000);
  await capture("linux-note-window-locked");
  console.log("ok: locking the first window locks the note window too");

  // 5. 別のウィンドウで解除すると、ロックの画面のままの最初のウィンドウも、そのキーで開く。
  await app.type(await app.find("#unlock-passphrase"), PASSPHRASE);
  await app.click(await app.findByXPath("//button[normalize-space()='解除']"));
  await waitUntil("the body of the note window after unlocking", bodyText, (text) => text?.includes("卵"));
  await switchToWindow(mainWindow);
  await app.waitForXPath("//button[normalize-space()='新しいメモ']", 15_000);
  await capture("linux-main-window-unlocked-by-note-window");
  console.log("ok: unlocking the note window unlocks the first window too");
} finally {
  await app.end();
}

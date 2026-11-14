// Android のエミュレーターに入れたアプリ（デバッグ版）で、操作したときに振動を要求するかを、OS の振動の記録
//（dumpsys vibrator_manager の Recent vibrations）で確かめる。対象は、チェックリストのチェック、設定のスイッチ、
// 一覧を払う操作と引いて同期の、しきい値を越えた瞬間。設定で切ると振動しないことも見る。
// 長押しで開くメニューでは、WebView が OS の長押しの振動を出すので、アプリからは振動を要求しないことを見る。
// 指の操作は、OS から届く本物のタッチにするため adb の input で送る。
//
// 前提: integration/s3-up.sh、`adb reverse tcp:18333 tcp:18333`（引いて同期には同期先が要る）。
//   デバッグ版の APK を入れ、初回の画面のまま起動して、WebView の DevTools を DEVTOOLS_PORT（既定 9333）へ forward しておく。
//   adb shell am start -n com.github.aida0710.sedumnote.debug/com.github.aida0710.sedumnote.MainActivity
//   adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>
// 使い方: ANDROID_HOME=... [DEVTOOLS_PORT=9333] node scripts/app-checks/hapticFeedbackOnAndroid.mjs <記録を置くフォルダ>

import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { pause, shell } from "./androidDevice.mjs";
import { newCheckRemoteConfig, PASSPHRASE, REMOTE_FIELDS, SYNC_KEY } from "./checkDevices.mjs";

const DEBUG_APP_PACKAGE = "com.github.aida0710.sedumnote.debug";
const devToolsPort = process.env.DEVTOOLS_PORT ?? "9333";
const outputDirectory = process.argv[2];
// アプリが要求する 1 回の振動（src/ui/platform/hapticFeedback.ts の HAPTIC_FEEDBACK_MILLISECONDS）。
const APP_VIBRATION_PATTERN = "original: Step=12ms";
// 振動の要求が OS の記録に載るまで待つ時間。
const RECORD_SETTLE_MILLISECONDS = 600;
// 長押しと見なされる長さ（Android の既定は 400〜500ms）より長く押す。
const LONG_PRESS_MILLISECONDS = 900;
// 払う・引く指の動きにかける時間。速すぎると途中の動きが届かない。
const DRAG_MILLISECONDS = 700;

const targets = await (await fetch(`http://127.0.0.1:${devToolsPort}/json/list`)).json();
const appTarget = targets.find((target) => target.type === "page" && target.url.startsWith("http"));
// WebView の画面の上での位置（端末の px）。ページの座標（CSS px）を端末の座標へ直すのに使う。
const webViewOrigin = JSON.parse(appTarget.description);
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${devToolsPort}`, { noDefaults: true });
const app = browser.contexts()[0].pages()[0];
app.setDefaultTimeout(30_000);

// 要素の中の位置（割合）を、端末の画面の座標にする。画面の外にある要素は、先に見える所まで送る。
async function devicePointOf(locator, { xFraction = 0.5, yFraction = 0.5 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const pixelRatio = await app.evaluate(() => window.devicePixelRatio);
  return {
    x: Math.round(webViewOrigin.screenX + (box.x + box.width * xFraction) * pixelRatio),
    y: Math.round(webViewOrigin.screenY + (box.y + box.height * yFraction) * pixelRatio),
    pixelRatio,
  };
}

async function tap(locator) {
  const { x, y } = await devicePointOf(locator);
  shell("input", "tap", String(x), String(y));
}

// スイッチを押し、押したあとの入り切りになったのを確かめる（押した所がずれて、ほかの物を押していないか）。
async function flipSwitch(switchControl) {
  const wasOn = await switchControl.isChecked();
  await tap(switchControl);
  await app.waitForFunction(([element, expected]) => element.checked === expected, [await switchControl.elementHandle(), !wasOn]);
}

async function longPress(locator) {
  const { x, y } = await devicePointOf(locator);
  shell("input", "swipe", String(x), String(y), String(x), String(y), String(LONG_PRESS_MILLISECONDS));
}

// from から、CSS px で (deltaX, deltaY) だけ指を動かして離す。
async function drag(locator, { from, deltaX, deltaY }) {
  const start = await devicePointOf(locator, from);
  const endX = Math.round(start.x + deltaX * start.pixelRatio);
  const endY = Math.round(start.y + deltaY * start.pixelRatio);
  shell("input", "swipe", String(start.x), String(start.y), String(endX), String(endY), String(DRAG_MILLISECONDS));
}

// 端末の今の時刻を、振動の記録の頭と同じ形（MM-DD HH:MM:SS.mmm）で返す。同じ日の中なら、文字のまま大小を比べられる。
function deviceTime() {
  return shell("date", "'+%m-%d %H:%M:%S.%3N'").trim();
}

// since より後に、このアプリのために出た振動の記録。記録は数に上限があり（古いものから消える）、並びも時刻順ではないので、
// 数の差ではなく、記録の頭の時刻で選ぶ。
function appVibrationsSince(since) {
  return shell("dumpsys", "vibrator_manager").split("\n")
    .filter((line) => line.includes(DEBUG_APP_PACKAGE) && line.trim().slice(0, since.length) >= since);
}

const log = [];
// action のあいだに、このアプリが要求した振動と、OS がこのアプリのために出した振動（長押しの振動など）を数える。
async function expectVibrations(description, { fromApp: expectedFromApp, fromSystem: expectedFromSystem = 0 }, action) {
  const since = deviceTime();
  await action();
  await pause(RECORD_SETTLE_MILLISECONDS);
  const added = appVibrationsSince(since);
  const fromApp = added.filter((line) => line.includes(APP_VIBRATION_PATTERN)).length;
  const fromSystem = added.length - fromApp;
  log.push(`## ${description}`, ...added.map((line) => line.trim()), "");
  const verdict = fromApp === expectedFromApp && fromSystem === expectedFromSystem ? "ok" : "NG";
  console.log(`${verdict}: ${description} (from app: ${fromApp}/${expectedFromApp}, from system: ${fromSystem}/${expectedFromSystem})`);
}

// エミュレーターのアプリは英語の画面になるので、日本語にする。
await app.evaluate(`localStorage.setItem("sedum-note:devicePreferences", JSON.stringify({ language: "ja", checkForUpdates: false }))`);
await app.reload();
const remote = await newCheckRemoteConfig();
await app.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
await app.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
await app.getByLabel("ほかのデバイスと同期する").check();
for (const [label, , field] of REMOTE_FIELDS) {
  await app.getByLabel(label).fill(remote[field]);
}
await app.getByRole("button", { name: "接続を確認" }).click();
await app.getByRole("radio", { name: "自分で入力する" }).click();
await app.getByLabel("暗号化キー", { exact: true }).fill(SYNC_KEY);
await app.getByRole("button", { name: "作成" }).click();

// 1. チェックリストのチェック（付ける・外す）。
await app.locator(".fab").click();
await app.getByPlaceholder("タイトル").fill("買い物");
await app.getByPlaceholder("タイトル").press("Enter");
await app.keyboard.type("[] 牛乳");
const checkbox = app.locator('.ProseMirror li[data-checked] input[type="checkbox"]');
await checkbox.waitFor();
await expectVibrations("チェックリストの項目にチェックを付ける", { fromApp: 1 }, async () => {
  await tap(checkbox);
  await app.locator('.ProseMirror li[data-checked="true"]').waitFor();
});
await expectVibrations("チェックリストの項目のチェックを外す", { fromApp: 1 }, async () => {
  await tap(checkbox);
  await app.locator('.ProseMirror li[data-checked="false"]').waitFor();
});
await app.getByRole("button", { name: "戻る" }).click();

// 2. 設定のスイッチ。振動の設定を切っている間は、ほかのスイッチでも振動しない。
await app.getByRole("button", { name: "設定", exact: true }).click();
await app.getByRole("button", { name: "一般", exact: true }).click();
const typewriterSwitch = app.getByRole("switch", { name: "タイプライターモード" });
const hapticSwitch = app.getByRole("switch", { name: "操作したときに振動する" });
await expectVibrations("設定のスイッチを入れる", { fromApp: 1 }, () => flipSwitch(typewriterSwitch));
await expectVibrations("設定のスイッチを切る", { fromApp: 1 }, () => flipSwitch(typewriterSwitch));
await expectVibrations("振動の設定を切る（切ったあとなので振動しない）", { fromApp: 0 }, () => flipSwitch(hapticSwitch));
await expectVibrations("振動の設定を切っている間は、ほかのスイッチでも振動しない", { fromApp: 0 }, () => flipSwitch(typewriterSwitch));
await expectVibrations("振動の設定を入れる", { fromApp: 1 }, () => flipSwitch(hapticSwitch));
await flipSwitch(typewriterSwitch);

// 3. 長押しで開くノートブックのメニュー。
await app.getByRole("button", { name: "ノートブック", exact: true }).click();
await app.getByRole("button", { name: "ノートブックを追加" }).click();
await app.getByRole("dialog").getByRole("textbox").fill("旅行");
await app.getByRole("dialog").getByRole("button", { name: "作成" }).click();
const notebookRow = app.locator(".notebook-row-open", { hasText: "旅行" });
await expectVibrations("ノートブックの行を長押ししてメニューを開く（OS の長押しの振動だけ）", { fromApp: 0, fromSystem: 1 }, async () => {
  await longPress(notebookRow);
  await app.getByRole("menu").waitFor();
});
await app.keyboard.press("Escape");

// 4. 一覧を引いて同期する。しきい値を越えたときに 1 回（離したときには振動しない）。
await app.getByRole("button", { name: "メモ", exact: true }).click();
const firstRow = app.locator(".note-item").first();
await firstRow.waitFor();
await expectVibrations("一覧を下へ引いて、同期のしきい値を越える", { fromApp: 1 }, () => drag(firstRow, { from: { yFraction: 0.3 }, deltaX: 0, deltaY: 260 }));
await pause(3_000);
await expectVibrations("しきい値に届かないところまで引いて離す（振動しない）", { fromApp: 0 }, () => drag(firstRow, { from: { yFraction: 0.3 }, deltaX: 0, deltaY: 80 }));

// 5. 一覧のメモを左へ払ってゴミ箱に入れる。しきい値を越えたときに 1 回。
await expectVibrations("一覧のメモを左へ払って、しきい値を越える", { fromApp: 1 }, async () => {
  await drag(firstRow, { from: { xFraction: 0.9 }, deltaX: -300, deltaY: 0 });
  await app.getByRole("status").filter({ hasText: "ゴミ箱に移動しました" }).waitFor();
});

writeFileSync(`${outputDirectory}/vibrations.md`, `# アプリが要求した振動の記録（dumpsys vibrator_manager）\n\n${log.join("\n")}\n`);
await browser.close();

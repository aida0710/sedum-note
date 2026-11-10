// 選ばれた試作（案C、artifacts/design-options/2026-11-10/prototype.html）と同じデータを実装に入れ、
// 同じ大きさ（PC 1280x820、スマホ 390x844）で撮る。ライトとダークの両方。手で流す確認の道具。
//
// 前提: `npx vite --host 127.0.0.1 --port 5173`。同期は使わない。
// 使い方: node scripts/app-checks/captureDesignComparison.mjs <画像を置くフォルダ>

import { chromium } from "@playwright/test";
import { PASSPHRASE } from "./checkDevices.mjs";

const outputDirectory = process.argv[2];

// 試作に出てくるノートブックとメモ。本文の「#」はタグになる。
const NOTEBOOKS = ["仕事", "旅行", "個人", "料理"];
const NOTES = [
  { notebook: "個人", title: "引っ越しのやること", body: "電気・ガス・水道の連絡、住所変更、ネットの工事の予約（2週間前まで）、粗大ごみの申し込み。" },
  { notebook: "料理", title: "カレーのレシピ（スパイス）", body: "クミン小さじ1、コリアンダー大さじ1、ターメリック小さじ1/2。玉ねぎは飴色になるまで20分。" },
  { notebook: "個人", title: "読みたい本", body: "数学ガール、プログラミング作法、失敗の本質" },
  { notebook: "仕事", title: "週次ミーティング 11/10", body: "決まったこと: リリースは来週の水曜。デザインの案は木曜までに2つ。 #todo" },
  { notebook: "旅行", title: "沖縄旅行の持ち物", body: "パスポートは不要。2日目にシュノーケルの予約あり（9:30 集合）。 #todo #沖縄" },
];

async function fillWorkspace(page) {
  await page.goto("http://127.0.0.1:5173/");
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
  await page.getByRole("button", { name: "作成" }).click();
  for (const name of NOTEBOOKS) {
    await page.getByRole("button", { name: "ノートブックを追加" }).click();
    await page.getByPlaceholder("ノートブックの名前").fill(name);
    await page.getByPlaceholder("ノートブックの名前").press("Enter");
  }
  for (const note of NOTES) {
    await page.getByRole("button", { name: new RegExp(`^${note.notebook}`) }).first().click();
    const tabsBefore = await page.getByRole("tab").count();
    await page.getByRole("button", { name: "新しいメモ" }).click();
    // 新しいメモのタブが開いてから打つ。早すぎると、前のメモのタイトル欄に入る。
    await page.waitForFunction((count) => document.querySelectorAll('[role="tab"]').length > count, tabsBefore);
    await page.getByPlaceholder("タイトル").fill(note.title);
    await page.getByPlaceholder("タイトル").press("Enter");
    await page.keyboard.type(note.body);
    await page.waitForTimeout(700);
  }
}

const browser = await chromium.launch();
for (const colorScheme of ["light", "dark"]) {
  const desktop = await (await browser.newContext({ viewport: { width: 1280, height: 820 }, colorScheme })).newPage();
  await fillWorkspace(desktop);
  await desktop.screenshot({ path: `${outputDirectory}/implementation-desktop-${colorScheme}.png` });

  // スマホは同じ保存（同じ origin の IndexedDB）を、狭い画面で開き直して撮る。
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme, storageState: await desktop.context().storageState({ indexedDB: true }) });
  const phone = await phoneContext.newPage();
  await phone.goto("http://127.0.0.1:5173/");
  await phone.getByLabel("パスフレーズ").fill(PASSPHRASE);
  await phone.getByRole("button", { name: "解除" }).click();
  await phone.getByRole("heading", { name: "すべてのメモ" }).waitFor();
  await phone.screenshot({ path: `${outputDirectory}/implementation-mobile-${colorScheme}.png` });
  await phone.getByRole("button", { name: /沖縄旅行の持ち物/ }).click();
  await phone.locator(".ProseMirror").waitFor();
  await phone.screenshot({ path: `${outputDirectory}/implementation-mobile-editor-${colorScheme}.png` });
  await desktop.context().close();
  await phoneContext.close();
}
await browser.close();

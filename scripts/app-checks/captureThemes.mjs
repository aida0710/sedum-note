// 組み込みのテーマを 1 つずつ当てて PC の画面を撮り、名前を付けて 1 枚に並べる。手で流す確認の道具。
//
// 前提: `npx vite --host 127.0.0.1 --port 5173`。
// 使い方: node scripts/app-checks/captureThemes.mjs <画像を置くフォルダ>

import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { UI_LOCALE } from "./checkDevices.mjs";
import { fillSampleWorkspace } from "./sampleWorkspace.mjs";

const outputDirectory = process.argv[2];
const THEME_NAMES = ["ライト", "ダーク", "セダム", "セダム（ダーク）", "セピア", "ミッドナイト"];
const SHOWN_NOTE = "沖縄旅行の持ち物";

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 820 }, locale: UI_LOCALE })).newPage();
await fillSampleWorkspace(page);
const captures = [];
for (const [index, themeName] of THEME_NAMES.entries()) {
  await page.getByRole("button", { name: /同期は未設定/ }).click();
  await page.getByRole("radio", { name: themeName, exact: true }).click();
  await page.getByRole("button", { name: SHOWN_NOTE }).first().click();
  await page.locator(".ProseMirror").waitFor();
  const path = `${outputDirectory}/theme-${index + 1}.png`;
  await page.screenshot({ path });
  captures.push({ themeName, path });
}

// 設定のテーマの欄（見本の並び）も撮る。
await page.getByRole("button", { name: /同期は未設定/ }).click();
await page.getByRole("radio", { name: "ライト", exact: true }).click();
await page.getByRole("button", { name: "テーマを作る" }).click();
await page.screenshot({ path: `${outputDirectory}/theme-settings.png` });

const sheet = await (await browser.newContext({ viewport: { width: 1960, height: 100 }, deviceScaleFactor: 1 })).newPage();
const cells = await Promise.all(captures.map(async ({ themeName, path }, index) =>
  `<figure><figcaption>${index + 1}. ${themeName}</figcaption><img src="data:image/png;base64,${(await readFile(path)).toString("base64")}"></figure>`));
await sheet.setContent(`<style>
  body { margin: 0; padding: 20px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; background: #888; font-family: "Noto Sans CJK JP", sans-serif; }
  figure { margin: 0; } figcaption { color: #fff; font-size: 22px; font-weight: 700; padding: 0 0 6px; } img { width: 100%; display: block; }
</style>${cells.join("")}`);
await sheet.screenshot({ path: `${outputDirectory}/theme-candidates.png`, fullPage: true });
await browser.close();

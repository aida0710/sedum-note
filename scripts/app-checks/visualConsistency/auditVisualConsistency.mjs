// 全画面を順に開いて、見た目のずれ（アイコン・文字の中心、チェックボックス、はみ出し）と、部品の役割ごとの
// 角丸・高さ・文字の大きさ・フォントを集める。手で流す確認の道具。結果は report.md と findings.json、各画面の画像。
//
// 前提: `npx vite --host 127.0.0.1 --port 5173`（別のポートなら BASE_URL で渡す）。同期は使わない。
// 使い方: node scripts/app-checks/visualConsistency/auditVisualConsistency.mjs <結果を置くフォルダ>
//   BROWSER=webkit で WebKit、THEME=ダーク のようにテーマを選んで流せる。英語の画面は、日本語の画面を回ったあとに
//   言語を英語にして、文言に頼らずに開ける画面だけを測る（auditScreens.mjs の ENGLISH_SCREENS）。

import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "@playwright/test";
import { PASSPHRASE, UI_LOCALE } from "../checkDevices.mjs";
import { fillSampleWorkspace } from "../sampleWorkspace.mjs";
import { measureScreen } from "./measureScreen.mjs";
import { writeAuditReport } from "./writeAuditReport.mjs";
import { DESKTOP_SCREENS, ENGLISH_SCREENS, PHONE_SCREENS } from "./auditScreens.mjs";

const outputDirectory = process.argv[2];
if (!outputDirectory) {
  throw new Error("結果を置くフォルダを引数に渡してください");
}
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:5173/";
const BROWSER_NAME = process.env.BROWSER ?? "chromium";
const THEME_NAME = process.env.THEME ?? null;
const DESKTOP_VIEWPORT = { width: 1280, height: 820 };
const PHONE_VIEWPORT = { width: 390, height: 844 };
// 画面を切り替えたあと、開く動き（メニューのフェードなど）が終わるのを待つ時間。
const SETTLE_MILLISECONDS = 300;

await mkdir(outputDirectory, { recursive: true });
const browserType = { chromium, webkit }[BROWSER_NAME];
const browser = await browserType.launch();
const screens = [];
const failures = [];

// 画面を測って撮る。CDP が使える Chromium では、描画に使われたフォントも調べる。
async function captureScreen(page, name) {
  await page.waitForTimeout(SETTLE_MILLISECONDS);
  const measured = await page.evaluate(measureScreen);
  const renderedFonts = BROWSER_NAME === "chromium" ? await readRenderedFonts(page, measured.fontSamples) : [];
  const imagePath = `${outputDirectory}/${String(screens.length + 1).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: imagePath });
  screens.push({ name, imagePath, findings: measured.findings, parts: measured.parts, fonts: measured.fonts, renderedFonts });
}

async function readRenderedFonts(page, fontSamples) {
  const session = await page.context().newCDPSession(page);
  await session.send("DOM.enable");
  await session.send("CSS.enable");
  const { root } = await session.send("DOM.getDocument", { depth: -1 });
  const rendered = [];
  for (const sample of fontSamples) {
    const { nodeId } = await session.send("DOM.querySelector", { nodeId: root.nodeId, selector: `[data-visual-audit-font="${sample.id}"]` });
    if (!nodeId) continue;
    const { fonts } = await session.send("CSS.getPlatformFontsForNode", { nodeId });
    rendered.push({ ...sample, platformFonts: fonts.map((font) => font.familyName) });
  }
  await session.detach();
  return rendered;
}

// 画面の 1 つを開いて測る。途中で失敗しても、ほかの画面は続ける。終わったら開いたメニューやダイアログを閉じる。
async function visitScreen(page, screen) {
  try {
    await screen.open(page, { captureScreen: (name) => captureScreen(page, name) });
    if (!screen.capturesItself) {
      await captureScreen(page, screen.name);
    }
  } catch (error) {
    failures.push({ screen: screen.name, message: String(error.message ?? error).split("\n")[0] });
  } finally {
    if (screen.close) {
      await screen.close(page).catch(() => {});
    } else {
      await page.keyboard.press("Escape").catch(() => {});
      await page.keyboard.press("Escape").catch(() => {});
    }
    // Escape で閉じないダイアログが残っていたら、背景を押して閉じる（次の画面の操作を塞がないように）。
    if (await page.locator(".dialog-backdrop").count()) {
      await page.mouse.click(4, 4).catch(() => {});
    }
  }
}

// 開けない画面で 30 秒（Playwright の既定）ずつ待たないように、操作の待ち時間を短くする。
const ACTION_TIMEOUT_MILLISECONDS = 10_000;

async function newAuditPage(viewport) {
  const context = await browser.newContext({ viewport, locale: UI_LOCALE });
  const page = await context.newPage();
  page.setDefaultTimeout(ACTION_TIMEOUT_MILLISECONDS);
  return page;
}

const desktop = await newAuditPage(DESKTOP_VIEWPORT);
const screenInput = { baseUrl: BASE_URL, passphrase: PASSPHRASE, themeName: THEME_NAME, fillSampleWorkspace };
for (const screen of [...DESKTOP_SCREENS(screenInput), ...ENGLISH_SCREENS(screenInput)]) {
  await visitScreen(desktop, screen);
}
const phone = await newAuditPage(PHONE_VIEWPORT);
for (const screen of PHONE_SCREENS(screenInput)) {
  await visitScreen(phone, screen);
}
await browser.close();

await writeFile(`${outputDirectory}/findings.json`, JSON.stringify({ browser: BROWSER_NAME, theme: THEME_NAME, screens, failures }, null, 2));
await writeFile(`${outputDirectory}/report.md`, writeAuditReport({ browser: BROWSER_NAME, theme: THEME_NAME, screens, failures }));
console.log(`screens=${screens.length} findings=${screens.reduce((sum, screen) => sum + screen.findings.length, 0)} failures=${failures.length}`);
for (const failure of failures) {
  console.log(`failed: ${failure.screen}: ${failure.message}`);
}

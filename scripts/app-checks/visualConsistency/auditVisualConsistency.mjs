// 全画面を順に開いて、見た目のずれ（アイコン・文字の中心、チェックボックス、はみ出し）、入れ物に合っているか（入力欄が幅いっぱいか、
// 閉じる「×」が右端か、メニューが窓に収まるか）と、部品の役割ごとの角丸・高さ・文字の大きさ・フォントを集める。
// 手で流す確認の道具。結果は report.md と findings.json、各画面の画像。役割ごとの値の割れも指摘に数える（除外は auditExceptions.mjs）。
//
// 前提: `npx vite --host 127.0.0.1 --port 5173`（別のポートなら BASE_URL で渡す）。同期の画面は試験用の S3（integration/s3-up.sh）を使う。
// 使い方: node scripts/app-checks/visualConsistency/auditVisualConsistency.mjs <結果を置くフォルダ>
//   BROWSER=webkit             WebKit で流す。
//   THEME=ダーク               テーマを選んでから回る（どの流し方でも、途中でダークの画面も何枚か撮る）。
//   DESKTOP_SIZE=1100x820      PC の窓の大きさ（既定 1280x820）。狭い PC の幅を見るときは 1100。
//   PHONE_SIZE=360x640         スマホの窓の大きさ（既定 390x844）。小さいスマホを見るときは 360x640。
//   DATA=worst                 見本のデータの代わりに、最悪のデータ（多い・長い・空・絵文字）を入れて回る（worstCaseScreens.mjs）。
//   RUNS=phone                 一部の流し方だけを回る（desktop・sync・phone をカンマで並べる。DATA=worst では使わない）。
//                              PHONE_SIZE だけを変えて見るときは RUNS=phone にすると、PC の画面を撮り直さずに済む。
// 英語の画面は、日本語の画面を回ったあとに言語を英語にして、文言に頼らずに開ける画面だけを測る（auditScreens.mjs の ENGLISH_SCREENS）。
// 新しい画面や状態（ダイアログ・メニュー・モード）を作ったら、同じコミットで auditScreens.mjs などの一覧にも足す。

import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "@playwright/test";
import { PASSPHRASE, UI_LOCALE } from "../checkDevices.mjs";
import { fillSampleWorkspace } from "../sampleWorkspace.mjs";
import { measureScreen } from "./measureScreen.mjs";
import { measureContainerFit } from "./measureContainerFit.mjs";
import { measureLeftoverJapanese } from "./measureLeftoverJapanese.mjs";
import { unlock, waitForLeavingCopies } from "./appOperations.mjs";
import { countAuditFindings, writeAuditReport } from "./writeAuditReport.mjs";
import { DESKTOP_SCREENS, ENGLISH_SCREENS, PHONE_SCREENS, UNVISITED_STATES } from "./auditScreens.mjs";
import { SYNC_SCREENS } from "./syncScreens.mjs";
import { WORST_CASE_DESKTOP_SCREENS, WORST_CASE_PHONE_SCREENS, prepareWorstCaseWorkspace } from "./worstCaseScreens.mjs";

const outputDirectory = process.argv[2];
if (!outputDirectory) {
  throw new Error("結果を置くフォルダを引数に渡してください");
}
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:5173/";
const BROWSER_NAME = process.env.BROWSER ?? "chromium";
const THEME_NAME = process.env.THEME ?? null;
const DATA = process.env.DATA ?? "sample";
const RUNS = new Set((process.env.RUNS ?? "desktop,sync,phone").split(","));

function viewportOf(size, fallback) {
  if (!size) return fallback;
  const [width, height] = size.split("x").map(Number);
  if (!width || !height) throw new Error(`窓の大きさは 1100x820 の形で渡してください: ${size}`);
  return { width, height };
}
const DESKTOP_VIEWPORT = viewportOf(process.env.DESKTOP_SIZE, { width: 1280, height: 820 });
const PHONE_VIEWPORT = viewportOf(process.env.PHONE_SIZE, { width: 390, height: 844 });
// 画面を切り替えたあと、開く動き（メニューのフェードなど）が終わるのを待つ時間。
const SETTLE_MILLISECONDS = 300;

await mkdir(outputDirectory, { recursive: true });
const browserType = { chromium, webkit }[BROWSER_NAME];
const browser = await browserType.launch();
const screens = [];
const failures = [];

// 画面を測って撮る。CDP が使える Chromium では、描画に使われたフォントも調べる。英語の画面では、残った日本語も探す。
async function captureScreen(page, name, { language }) {
  await page.waitForTimeout(SETTLE_MILLISECONDS);
  const measured = await page.evaluate(measureScreen);
  const containerFindings = await page.evaluate(measureContainerFit);
  const japaneseFindings = language === "en" ? await page.evaluate(measureLeftoverJapanese) : [];
  const renderedFonts = BROWSER_NAME === "chromium" ? await readRenderedFonts(page, measured.fontSamples) : [];
  const imagePath = `${outputDirectory}/${String(screens.length + 1).padStart(3, "0")}-${name}.png`;
  await page.screenshot({ path: imagePath });
  const findings = [...measured.findings, ...containerFindings, ...japaneseFindings];
  screens.push({ name, imagePath, findings, parts: measured.parts, fonts: measured.fonts, renderedFonts });
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

// 1 つの画面の開き方（と閉じ方）が終わるまでの上限。操作の 1 つずつは ACTION_TIMEOUT_MILLISECONDS で止まるが、
// 道具の誤り（閉じないダイアログを閉じ続けるなど）で待ち続けると、残りの画面が撮れなくなる。いちばん長い画面
// （設定の全ページをスクロールしながら撮る）でも 1 分ほどなので、その倍にする。
const SCREEN_DEADLINE_MILLISECONDS = 120_000;

async function withinScreenDeadline(work, label) {
  let timer = null;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}が ${SCREEN_DEADLINE_MILLISECONDS / 1000} 秒で終わらなかった`)), SCREEN_DEADLINE_MILLISECONDS);
  });
  try {
    return await Promise.race([work(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

// 失敗の報告には、Playwright の長い説明の 1 行目（何の操作が何秒で止まったか）だけを載せる。
const firstLineOf = (error) => String(error.message ?? error).split("\n")[0];

// 開けなかった画面が残したもの（開いたままのダイアログ、設定の打ちかけ、フォーカスモードなど）で、続く画面まで開けなくならないよう、
// ページを読み込み直して、そのときの保存された状態（開いているタブなど）の画面へ戻す。ロックの画面ならロックを解除する。
async function returnToSavedState(page) {
  await page.reload();
  await page.locator(".workspace, .phone, .entry").first().waitFor();
  // 最初の画面（.segmented で「新規設定」と「バックアップから復元」を選ぶ）はそのまま。ロックの画面だけ解除する。
  const isUnlockScreen = await page.locator(".entry").isVisible() && await page.locator(".entry .segmented").count() === 0;
  if (isUnlockScreen) {
    await unlock(page, PASSPHRASE);
  }
}

// 画面の 1 つを開いて測る。途中で失敗しても、ほかの画面は続ける。終わったら開いたメニューやダイアログを閉じる。
async function visitScreen(page, screen) {
  const capture = (name) => captureScreen(page, name, { language: screen.language });
  const failuresBefore = failures.length;
  try {
    await withinScreenDeadline(async () => {
      await screen.open(page, { captureScreen: capture });
      if (!screen.capturesItself) {
        await capture(screen.name);
      }
    }, "開いて撮る");
  } catch (error) {
    failures.push({ screen: screen.name, message: firstLineOf(error) });
    // どこで止まったかを見られるよう、開けなかったときの画面を残す（測らない）。
    await page.screenshot({ path: `${outputDirectory}/failed-${screen.name}.png` }).catch(() => {});
  } finally {
    try {
      await withinScreenDeadline(async () => {
        if (screen.close) {
          await screen.close(page);
        } else {
          await page.keyboard.press("Escape");
          await page.keyboard.press("Escape");
        }
      }, "閉じる");
    } catch (error) {
      failures.push({ screen: `${screen.name}（閉じる）`, message: firstLineOf(error) });
    }
    if (failures.length > failuresBefore) {
      await returnToSavedState(page).catch((error) => {
        failures.push({ screen: `${screen.name}（読み込み直し）`, message: firstLineOf(error) });
      });
    } else {
      await clearLeftoverDialog(page);
    }
  }
}

// 閉じたダイアログの消える動きの写しが消えるのを待ち（写しがある間は、次の画面のショートカットが効かない）、
// Escape で閉じないダイアログが残っていたら、背景を押して閉じる（次の画面の操作を塞がないように）。
async function clearLeftoverDialog(page) {
  await waitForLeavingCopies(page);
  if (await page.locator(".dialog-backdrop").count()) {
    await page.mouse.click(4, 4).catch(() => {});
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

const screenInput = { baseUrl: BASE_URL, passphrase: PASSPHRASE, themeName: THEME_NAME, fillSampleWorkspace, phoneViewport: PHONE_VIEWPORT };
// 1 回の流し方は、新しいページ（空のブラウザの保存先）ごとの画面の一覧の並び。prepare は、画面を回る前に 1 度だけ行う準備
// （画面ごとの時間の上限は当てない）。
const runs = DATA === "worst"
  ? [{
    viewport: DESKTOP_VIEWPORT,
    prepare: (page) => prepareWorstCaseWorkspace(page, screenInput),
    screens: [...WORST_CASE_DESKTOP_SCREENS(), ...WORST_CASE_PHONE_SCREENS(screenInput)],
  }]
  : [
    { name: "desktop", viewport: DESKTOP_VIEWPORT, screens: [...DESKTOP_SCREENS(screenInput), ...ENGLISH_SCREENS(screenInput)] },
    { name: "sync", viewport: DESKTOP_VIEWPORT, screens: SYNC_SCREENS(screenInput) },
    { name: "phone", viewport: PHONE_VIEWPORT, screens: PHONE_SCREENS(screenInput) },
  ].filter((run) => RUNS.has(run.name));
for (const run of runs) {
  const page = await newAuditPage(run.viewport);
  if (run.prepare) {
    // 準備が失敗しても、どの画面が開けないかを報告に残すため、画面は回る。
    await run.prepare(page).catch((error) => failures.push({ screen: "（準備）", message: firstLineOf(error) }));
  }
  for (const screen of run.screens) {
    await visitScreen(page, screen);
  }
  await page.context().close();
}
await browser.close();

const result = { browser: BROWSER_NAME, theme: THEME_NAME, screens, failures, unvisited: DATA === "worst" ? [] : UNVISITED_STATES };
await writeFile(`${outputDirectory}/findings.json`, JSON.stringify(result, null, 2));
await writeFile(`${outputDirectory}/report.md`, writeAuditReport(result));
console.log(`screens=${screens.length} findings=${countAuditFindings(result)} failures=${failures.length}`);
for (const failure of failures) {
  console.log(`failed: ${failure.screen}: ${failure.message}`);
}

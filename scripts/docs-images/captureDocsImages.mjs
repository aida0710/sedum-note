// ドキュメント（pages/）に載せる画面を撮り直す道具。見本のデータ（docsSampleNotes.mjs）を新しい vault に入れ、
// 画面を順に開いて pages/public/images/ に WebP で保存する。画面を変えたら流し直す。
//
// 前提: 開発サーバー（`npx vite --host 127.0.0.1 --port 5390` など。BASE_URL で渡す）と、
//       同期の画面のための試験用の S3（integration/s3-up.sh）。外のサービスにはつながない（AI の答えは page.route で返す）。
// 使い方: BASE_URL=http://127.0.0.1:5390/ node scripts/docs-images/captureDocsImages.mjs
//   ONLY=workspace,graph   名前を挙げた画像だけを保存する（画面は最初から順に開く）。
// 期限の印（📅）は絵文字なので、絵文字のフォント（Noto Color Emoji など）が無いマシンでは四角になる。入れずに撮るときは、
// フォントのフォルダを足した fontconfig の設定を FONTCONFIG_FILE で渡す（ブラウザはこの道具の環境変数を受け継ぐ）。

import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { messagePattern, translate } from "../app-checks/appMessages.mjs";
import { PASSPHRASE, REMOTE_FIELDS, UI_LOCALE, newCheckRemoteConfig } from "../app-checks/checkDevices.mjs";
import { routeFakeClaude } from "../app-checks/visualConsistency/aiChatScreens.mjs";
import {
  closeSlashMenu, openBlockMenu, openEditorMoreMenu, openSettingsOnDesktop, openSlashMenu, placeCursorAtEnd, selectFirstParagraph,
  unlock, waitForLeavingCopies,
} from "../app-checks/visualConsistency/appOperations.mjs";
import { createImageWriter } from "./docsImageFiles.mjs";
import { DESIGN_NOTE_TITLE, MEETING_NOTE_TITLE, PACKING_NOTE_TITLE, STUDY_NOTE_TITLE, TRIP_NOTE_TITLE } from "./docsSampleNotes.mjs";
import { closeAllTabs, createVault, fillDocsSampleWorkspace, openSampleNote } from "./docsSampleWorkspace.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:5173/";
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const PHONE_VIEWPORT = { width: 390, height: 844 };
// 「/」のメニューを下に開かせるための、窓の高さ。
const TALL_VIEWPORT_HEIGHT = 1200;
// 2 倍で撮ると、高解像度の画面でも文字がにじまない。
const DEVICE_SCALE_FACTOR = 2;
// メニューの開く動きと、描き直しが終わるのを待つ時間。
const SETTLE_MILLISECONDS = 400;
// 部品だけを切り出すときに、周りに残す余白。
const CLIP_PADDING = 24;
// 本文に貼る写真の幅。本文の幅いっぱいだと、下の PDF のプレビューが画面に入らない。
const ATTACHMENT_IMAGE_WIDTH = 360;
const ATTACHMENT_IMAGE = { name: "霧の中のブランコ.webp", mimeType: "image/webp", buffer: await readFile(new URL("../../public/app-artwork.webp", import.meta.url)) };
// 同期の画面に見せる、同期先の入力の例（実際にはつながない）。
const EXAMPLE_REMOTE = {
  endpoint: "https://s3.ap-northeast-1.amazonaws.com", bucket: "my-sedum-note", region: "ap-northeast-1", prefix: "",
  accessKeyId: "EXAMPLE-ACCESS-KEY-ID", secretAccessKey: "example-secret-access-key",
};

// 日付の入力欄の書き方（2026/11/20 か 11/20/2026 か）は、ページの言語ではなくブラウザを起動したときの LANG で決まる。
const browser = await chromium.launch({ env: { ...process.env, LANG: "ja_JP.UTF-8" } });
const images = await createImageWriter(browser);

async function boxOf(locator) {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`画面に見えていません: ${locator}`);
  return box;
}

// 画面全体か、elements をまとめて囲む範囲（region を渡せばその範囲）を撮る。ポインターは、keepPointer でなければ
// 撮る前に画面の端へ動かす（行に乗ったときの色やボタンを写さない）。
async function capture(page, name, { elements = [], region, padding = CLIP_PADDING, keepPointer = false } = {}) {
  if (ONLY && !ONLY.has(name)) return;
  if (!keepPointer) await page.mouse.move(page.viewportSize().width - 1, page.viewportSize().height - 1);
  await page.waitForTimeout(SETTLE_MILLISECONDS);
  let clip = region;
  if (elements.length > 0) {
    const boxes = await Promise.all(elements.map(boxOf));
    const viewport = page.viewportSize();
    const left = Math.max(0, Math.min(...boxes.map((box) => box.x)) - padding);
    const top = Math.max(0, Math.min(...boxes.map((box) => box.y)) - padding);
    const right = Math.min(viewport.width, Math.max(...boxes.map((box) => box.x + box.width)) + padding);
    const bottom = Math.min(viewport.height, Math.max(...boxes.map((box) => box.y + box.height)) + padding);
    clip = { x: left, y: top, width: right - left, height: bottom - top };
  }
  await images.save(name, await page.screenshot({ clip, animations: "disabled", caret: "hide" }));
}

async function openPage(viewport, options = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: DEVICE_SCALE_FACTOR, locale: UI_LOCALE, colorScheme: "light", ...options });
  return context.newPage();
}

async function closeMenus(page) {
  await page.keyboard.press("Escape");
  await waitForLeavingCopies(page);
}

// サイドバーの右の、メモを開く所（タブとエディタ）の範囲。上から height までを撮る。
async function mainArea(page, height = DESKTOP_VIEWPORT.height) {
  const sidebar = await boxOf(page.locator(".sidebar").first());
  const left = sidebar.x + sidebar.width;
  return { x: left, y: 0, width: DESKTOP_VIEWPORT.width - left, height };
}

async function scrollNoteToTop(page) {
  await page.locator(".document-scroll").first().evaluate((element) => { element.scrollTop = 0; });
}

// 前の画面で選んだ文字（検索で当たった所など）を外す。選んだままだと、書式のボタンや AI チャットの「選択範囲」が写る。
async function clearSelection(page) {
  await page.locator(".ProseMirror").first().evaluate((element) => {
    element.editor.commands.setTextSelection(1);
    element.editor.commands.blur();
  });
}

// 前の画面で開いたタブを閉じてから、titles のメモを順に開く（最後のものが前に出る）。
async function openOnly(page, titles) {
  await closeAllTabs(page);
  for (const title of titles) {
    await openSampleNote(page, title);
  }
  await clearSelection(page);
  await scrollNoteToTop(page);
}

async function fillRemoteFields(page, remote) {
  for (const [label, , field] of REMOTE_FIELDS) {
    await page.getByLabel(label).fill(remote[field]);
  }
}

// ---- PC の画面 ----

const desktop = await openPage(DESKTOP_VIEWPORT);
await desktop.goto(BASE_URL);
await desktop.getByLabel(translate("setup.passphrase"), { exact: true }).waitFor();
await capture(desktop, "setup", { elements: [desktop.locator(".entry-card")] });

await createVault(desktop, { baseUrl: BASE_URL, passphrase: PASSPHRASE });
await fillDocsSampleWorkspace(desktop);

// 写すタブは 4 つ。設計メモを前に出す。
const WORKSPACE_TABS = [PACKING_NOTE_TITLE, STUDY_NOTE_TITLE, MEETING_NOTE_TITLE, DESIGN_NOTE_TITLE];
await openOnly(desktop, WORKSPACE_TABS);
await capture(desktop, "workspace");

// ---- 書く ----

// 「/」のメニューは縦に長く、下に入りきらないと上に開いてタブに重なる。この画像だけ窓を縦に伸ばして、下に開かせる。
await desktop.setViewportSize({ width: DESKTOP_VIEWPORT.width, height: TALL_VIEWPORT_HEIGHT });
await openSampleNote(desktop, "読みたい本");
await openSlashMenu(desktop);
await capture(desktop, "editor-slash-menu", { elements: [desktop.locator(".slash-menu"), desktop.locator(".ProseMirror > p").last()] });
await closeSlashMenu(desktop);
await desktop.setViewportSize(DESKTOP_VIEWPORT);

await openSampleNote(desktop, DESIGN_NOTE_TITLE);
await placeCursorAtEnd(desktop);
await scrollNoteToTop(desktop);
await selectFirstParagraph(desktop);
await desktop.locator(".selection-toolbar").waitFor({ state: "visible" });
await capture(desktop, "editor-selection-toolbar", { elements: [desktop.locator(".selection-toolbar"), desktop.locator(".ProseMirror > p").first(), desktop.locator(".ProseMirror > ul").first()] });

// ブロックのメニューは縦に長いので、段落を画面の上のほうへ送ってから開く（下が切れないように）。
await placeCursorAtEnd(desktop);
const firstParagraph = desktop.locator(".ProseMirror > p").first();
await firstParagraph.evaluate((element) => element.scrollIntoView({ block: "start" }));
await openBlockMenu(desktop, firstParagraph);
await capture(desktop, "editor-block-menu", { elements: [desktop.getByRole("menu"), firstParagraph] });
await closeMenus(desktop);

await scrollNoteToTop(desktop);
await desktop.locator(".ProseMirror td").first().click();
await desktop.locator(".editor-bar").getByRole("button", { name: translate("editor.table") }).click();
await desktop.getByRole("menu").waitFor();
await capture(desktop, "editor-table", { region: await mainArea(desktop) });
await closeMenus(desktop);

await openOnly(desktop, WORKSPACE_TABS.slice(0, 2));
await capture(desktop, "editor-math-callout", { region: await mainArea(desktop) });

// ---- リンク ----

await openSampleNote(desktop, DESIGN_NOTE_TITLE);
await desktop.locator(".backlinks").scrollIntoViewIfNeeded();
await capture(desktop, "editor-backlinks", { region: await mainArea(desktop) });

await openSampleNote(desktop, MEETING_NOTE_TITLE);
const link = desktop.locator(".ProseMirror .note-link").last();
await link.scrollIntoViewIfNeeded();
await link.hover();
await desktop.getByRole("tooltip").waitFor();
await capture(desktop, "editor-link-preview", { elements: [link, desktop.getByRole("tooltip"), desktop.locator(".ProseMirror h2").last()], keepPointer: true });

await desktop.keyboard.press("Control+Alt+G");
await desktop.waitForTimeout(2000);
await capture(desktop, "graph", { region: await mainArea(desktop) });

// ---- 画像・ファイル ----

await openSampleNote(desktop, TRIP_NOTE_TITLE);
await placeCursorAtEnd(desktop);
await desktop.locator('input[type="file"][accept="image/*"]:not([capture])').setInputFiles(ATTACHMENT_IMAGE);
await desktop.locator(".attachment-image.loaded").first().waitFor();
await desktop.locator(".ProseMirror").first().evaluate((element, width) => {
  const { editor } = element;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "attachmentImage") {
      editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, width }));
    }
  });
}, ATTACHMENT_IMAGE_WIDTH);
const pdfMaker = await (await browser.newContext()).newPage();
await pdfMaker.setContent(`<body style="font-family: sans-serif; padding: 40px"><h1>航空券の控え</h1><p>那覇行き　1日目　朝の便</p><p>東京行き　3日目　夕方の便</p></body>`);
const itineraryPdf = { name: "航空券の控え.pdf", mimeType: "application/pdf", buffer: await pdfMaker.pdf({ format: "A6", landscape: true }) };
await placeCursorAtEnd(desktop);
await desktop.locator('input[type="file"]:not([accept])').setInputFiles(itineraryPdf);
await desktop.locator(".attachment-file").last().waitFor();
await desktop.getByRole("button", { name: translate("editor.pdfPreview", { name: itineraryPdf.name }) }).click();
await desktop.waitForTimeout(1500);
await desktop.locator(".attachment-image").first().evaluate((element) => element.scrollIntoView({ block: "start" }));
await capture(desktop, "editor-attachments", { region: await mainArea(desktop) });

// ---- ズーム ----

await openSampleNote(desktop, DESIGN_NOTE_TITLE);
const policyHeading = desktop.locator(".ProseMirror h2", { hasText: "方針" });
await policyHeading.scrollIntoViewIfNeeded();
await policyHeading.hover();
await policyHeading.getByRole("button", { name: translate("editor.zoomIntoSection") }).click();
await desktop.locator(".zoom-back").waitFor();
await capture(desktop, "editor-zoom", { region: { x: 0, y: 0, width: DESKTOP_VIEWPORT.width, height: 560 } });
while (await desktop.locator(".zoom-back").count() > 0) await desktop.locator(".zoom-back").click();

// ---- 検索 ----

await desktop.locator(".ProseMirror").first().click();
await desktop.keyboard.press("Control+F");
await desktop.locator(".find-bar").waitFor();
await desktop.keyboard.type("索引");
await desktop.getByRole("button", { name: translate("editor.showReplace") }).click();
await desktop.locator(".document-scroll").first().evaluate((element) => { element.scrollTop = 0; });
await capture(desktop, "find-replace", { region: await mainArea(desktop) });
await desktop.keyboard.press("Escape");

await desktop.keyboard.press("Control+K");
await desktop.getByRole("dialog").waitFor();
await desktop.keyboard.type("沖縄");
await capture(desktop, "command-palette");
await closeMenus(desktop);

await desktop.locator(".sidebar").getByRole("button", { name: translate("sidebar.search"), exact: true }).click();
await desktop.getByPlaceholder(translate("sidebar.searchPlaceholder")).fill("#todo");
await capture(desktop, "sidebar-search");
await desktop.locator(".sidebar").getByRole("button", { name: translate("sidebar.search"), exact: true }).click();

// ---- データベース表示 ----

const workRow = desktop.locator(".nav-row", { has: desktop.locator(".nav-label", { hasText: /^仕事$/ }) }).first();
await workRow.hover();
await workRow.getByRole("button", { name: translate("editor.more") }).click();
await desktop.getByRole("menuitem", { name: translate("database.open") }).click();
await desktop.locator(".database-view").waitFor();
await capture(desktop, "database-table", { region: await mainArea(desktop, 420) });
await desktop.getByRole("radio", { name: translate("database.layout.board") }).click();
await capture(desktop, "database-board", { region: await mainArea(desktop, 420) });

// ---- タブとウィンドウ ----

await openOnly(desktop, [STUDY_NOTE_TITLE, PACKING_NOTE_TITLE]);
await openEditorMoreMenu(desktop);
await desktop.getByRole("menuitem", { name: translate("split.open") }).click();
await openSampleNote(desktop, TRIP_NOTE_TITLE);
await desktop.locator(".split-pane").waitFor();
await desktop.locator(".document-scroll").evaluateAll((elements) => elements.forEach((element) => { element.scrollTop = 0; }));
await capture(desktop, "split-view");
await desktop.getByRole("button", { name: translate("split.close") }).click();

// ---- 期限 ----

await closeAllTabs(desktop);
await desktop.keyboard.press("Control+Alt+E");
await desktop.locator(".reminders-view").waitFor();
await capture(desktop, "reminders", { region: await mainArea(desktop, 460) });

// ---- AI チャット ----

await routeFakeClaude(desktop, {
  summary: "このメモの要点は次のとおりです。\n\n- 検索の結果が出るまでの時間を、0.1秒以内にする\n- 索引は保存したときに更新し、ひらがなとカタカナを同じ文字として扱う\n- 残りは、索引の形を決めることと、試作で測り直すこと",
  editText: "「やること」の「試作を作って測り直す」にチェックを付けます。",
  editedMarkdown: (markdown) => markdown.replace("- [ ] 試作を作って測り直す", "- [x] 試作を作って測り直す"),
  editDoneText: "チェックを付けました。",
});
await closeAllTabs(desktop);
await openSettingsOnDesktop(desktop, "ai");
await desktop.getByRole("switch", { name: translate("ai.enable") }).check();
await desktop.getByLabel(translate("ai.apiKey")).fill("docs-image-not-a-key");
await desktop.getByRole("button", { name: translate("ai.verifyAndSave") }).click();
await desktop.getByRole("status").filter({ hasText: messagePattern("ai.verified") }).waitFor();
await capture(desktop, "settings-ai", { region: await mainArea(desktop) });
await openOnly(desktop, WORKSPACE_TABS);
await desktop.keyboard.press("Control+Alt+A");
const chat = desktop.getByRole("region", { name: translate("ai.chat") });
await chat.getByRole("button", { name: translate("ai.task.summarize") }).click();
await desktop.locator(".ai-message.assistant").first().waitFor();
await capture(desktop, "ai-chat");
await chat.getByRole("textbox", { name: translate("ai.chatInput") }).fill("測り直しも終わったので、チェックを付けて");
await desktop.keyboard.press("Enter");
await chat.getByRole("group", { name: translate("ai.approval.label") }).waitFor();
await capture(desktop, "ai-approval", { elements: [chat], padding: 0 });
// 許可すると、履歴に AI が変える前（自分の編集）と、変えた結果（AIチャットの編集）が残る。その履歴を撮る。
await chat.getByRole("button", { name: translate("ai.approval.apply"), exact: true }).click();
await chat.getByRole("group", { name: translate("ai.approval.label") }).waitFor({ state: "detached" });
await desktop.keyboard.press("Control+Alt+A");

// ---- 履歴 ----

await openEditorMoreMenu(desktop);
await desktop.getByRole("menuitem", { name: translate("editor.history") }).click();
await desktop.getByRole("dialog").getByRole("option").first().click();
await capture(desktop, "history", { elements: [desktop.getByRole("dialog")] });
await closeMenus(desktop);

// ---- 設定 ----

await closeAllTabs(desktop);
for (const settingsPage of ["appearance", "shortcuts", "plugins", "security", "data"]) {
  await openSettingsOnDesktop(desktop, settingsPage);
  await capture(desktop, `settings-${settingsPage}`, { region: await mainArea(desktop) });
}

await openSettingsOnDesktop(desktop, "appearance");
await desktop.getByRole("radio", { name: translate("theme.name.dark"), exact: true }).click();
await openOnly(desktop, WORKSPACE_TABS);
await capture(desktop, "workspace-dark");
await openSettingsOnDesktop(desktop, "appearance");
await desktop.getByRole("radio", { name: translate("theme.name.system"), exact: true }).click();

await desktop.keyboard.press("Control+L");
await desktop.locator("input[type=password]").first().waitFor();
await capture(desktop, "unlock", { elements: [desktop.locator(".entry-card")] });
await unlock(desktop, PASSPHRASE);

// ---- 同期（入力の例を撮ったあと、試験用の S3 の新しいフォルダを同期先にする） ----

const syncPage = await openPage(DESKTOP_VIEWPORT);
await syncPage.goto(BASE_URL);
await syncPage.getByLabel(translate("setup.passphrase"), { exact: true }).fill(PASSPHRASE);
await syncPage.getByLabel(translate("setup.passphraseConfirm")).fill(PASSPHRASE);
await syncPage.getByLabel(translate("setup.useSync")).check();
await fillRemoteFields(syncPage, EXAMPLE_REMOTE);
await syncPage.getByLabel(REMOTE_FIELDS[0][0]).scrollIntoViewIfNeeded();
await capture(syncPage, "setup-sync", { elements: [syncPage.locator(".entry-card")], padding: 0 });
await fillRemoteFields(syncPage, await newCheckRemoteConfig());
await syncPage.getByRole("button", { name: translate("syncTarget.check") }).click();
await syncPage.getByRole("status").filter({ hasText: translate("syncTarget.empty") }).waitFor();
await syncPage.getByRole("radio", { name: translate("syncKey.source.generate") }).click();
await syncPage.getByRole("button", { name: translate("setup.submitNew") }).click();
const keyDialog = syncPage.getByRole("dialog");
await keyDialog.waitFor();
await capture(syncPage, "sync-key-generated", { elements: [keyDialog] });
const noted = keyDialog.getByRole("checkbox");
if (await noted.count()) await noted.first().check();
await keyDialog.getByRole("button").last().click();
await syncPage.locator(".sidebar").getByRole("button", { name: translate("common.createNote"), exact: true }).waitFor();
await openSettingsOnDesktop(syncPage, "sync");
await syncPage.getByRole("button", { name: translate("syncSetup.export") }).click();
await syncPage.getByRole("dialog").waitFor();
await capture(syncPage, "sync-export", { elements: [syncPage.getByRole("dialog")] });

// ---- スマホの画面 ----

const phone = await openPage(PHONE_VIEWPORT, { isMobile: true, hasTouch: true });
await createVault(phone, { baseUrl: BASE_URL, passphrase: PASSPHRASE });
await fillDocsSampleWorkspace(phone);
await phone.getByRole("button", { name: translate("editor.back") }).click();
await phone.locator(".tabbar").getByRole("button", { name: translate("mobile.notes") }).click();
await capture(phone, "phone-list");
await phone.locator(".note-item", { hasText: DESIGN_NOTE_TITLE }).first().click();
await phone.locator(".ProseMirror").waitFor();
await capture(phone, "phone-editor");

await browser.close();
console.log(images.written.join("\n"));

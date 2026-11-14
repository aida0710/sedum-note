// 最悪のデータ（worstCaseWorkspace.mjs）を入れた画面の一覧。DATA=worst のときに、auditScreens.mjs の一覧の代わりに回る。
// PC の一覧のあと、同じページを窓の大きさだけスマホにして、スマホの一覧を回る（データを入れ直さない）。
// 1 つの画面は auditScreens.mjs と同じ形 { name, open(page, { captureScreen }), close?(page), capturesItself? }。

import { translate } from "../appMessages.mjs";
import { exposeApp, navigate } from "./appInternals.mjs";
import { openEditorMoreMenu, placeCursorAtEnd, unlock } from "./appOperations.mjs";
import { WORST_CASE_TEXT, fillWorstCaseWorkspace } from "./worstCaseWorkspace.mjs";

// 開いたメモの本文が描かれ、題が出るまでの待ち時間の目安（画面の切り替えの動きを含む）。
const NOTE_OPEN_SETTLE_MILLISECONDS = 400;
const TOAST_COUNT = 5;

// 一覧どうしで、入れたデータの ID を受け渡す。
const seeded = { ids: null };

async function openNote(page, noteId) {
  await navigate(page, "openNote", noteId);
  await page.locator(".ProseMirror").first().waitFor();
  await page.waitForTimeout(NOTE_OPEN_SETTLE_MILLISECONDS);
}

const scrollTo = (page, selector, where) => page.locator(selector).first().evaluate((element, position) => {
  element.scrollTop = position === "end" ? element.scrollHeight : position;
}, where);

const notebookRow = (page, name) => page.locator(".nav-row", { has: page.locator(".nav-label", { hasText: name }) }).first();

// 入れたデータを読み直す（AI の設定と会話は、ロックの解除のときに読む）。
async function reloadAndUnlock(page, baseUrl, passphrase) {
  await page.goto(baseUrl);
  await page.locator("input[type=password]").first().waitFor();
  await unlock(page, passphrase);
}

// 新しい vault を作って最悪のデータを入れ、読み込み直してロックを解除する。数百件を書くので、画面ごとの時間の上限の外
// （流し方の準備。auditVisualConsistency.mjs の prepare）で行う。
export async function prepareWorstCaseWorkspace(page, { baseUrl, passphrase }) {
  await page.goto(baseUrl);
  await page.getByLabel(translate("setup.passphrase"), { exact: true }).fill(passphrase);
  await page.getByLabel(translate("setup.passphraseConfirm")).fill(passphrase);
  await page.getByRole("button", { name: translate("setup.submitNew") }).click();
  await page.locator(".workspace").waitFor();
  seeded.ids = await fillWorstCaseWorkspace(page);
  await reloadAndUnlock(page, baseUrl, passphrase);
}

export function WORST_CASE_DESKTOP_SCREENS() {
  return [
    {
      name: "worst-sidebar",
      capturesItself: true,
      open: async (page, { captureScreen }) => {
        await captureScreen("worst-sidebar-top");
        await scrollTo(page, ".sidebar-scroll", "end");
        await captureScreen("worst-sidebar-bottom");
        await scrollTo(page, ".sidebar-scroll", 0);
      },
    },
    {
      name: "worst-nested-notebooks",
      open: async (page) => {
        for (let depth = 1; depth <= 6; depth += 1) {
          await notebookRow(page, `入れ子 ${depth} 段目`).locator(".disclosure").first().click();
        }
      },
    },
    {
      name: "worst-long-notebook-name",
      open: async (page) => {
        const row = notebookRow(page, "とても長いノートブック");
        await row.scrollIntoViewIfNeeded();
        await row.hover();
      },
    },
    {
      // 左の列のいちばん下の行のメニュー。低い位置から開くメニューが窓に収まるか。
      name: "worst-menu-near-bottom",
      open: async (page) => {
        await scrollTo(page, ".sidebar-scroll", "end");
        const last = page.locator(".nav-row:has(button[aria-haspopup=menu])").last();
        await last.hover();
        await last.locator("button[aria-haspopup=menu]").first().click();
        await page.getByRole("menu").waitFor();
      },
    },
    {
      name: "worst-tabs-30",
      capturesItself: true,
      open: async (page, { captureScreen }) => {
        await exposeApp(page);
        const noteIds = await page.evaluate(() => window.__visualAudit.repository.notes().filter((note) => note.content.trashedAt === null).slice(0, 26).map((note) => note.id));
        const { notes } = seeded.ids;
        for (const noteId of [...noteIds, notes.longTitleJa, notes.longTitleAscii, notes.emojiTitle, notes.emptyTitle]) {
          await navigate(page, "openNote", noteId);
        }
        await captureScreen("worst-tabs-30");
        await page.locator(".tabs-bar button[aria-haspopup=menu]").first().click();
        await page.getByRole("menu").waitFor();
        await captureScreen("worst-tab-list-30");
      },
    },
    ...["longTitleJa", "longTitleAscii", "emojiTitle", "emptyTitle", "manyTags", "wideTable", "longLines", "properties"].map((key) => ({
      name: `worst-note-${key}`,
      open: (page) => openNote(page, seeded.ids.notes[key]),
    })),
    {
      name: "worst-outline-80",
      capturesItself: true,
      open: async (page, { captureScreen }) => {
        await openNote(page, seeded.ids.notes.headings);
        if (!(await page.locator(".outline").count())) {
          await page.locator(".editor-bar").getByRole("button", { name: translate("editor.outline") }).click();
        }
        await captureScreen("worst-outline-80-top");
        await scrollTo(page, ".outline", "end");
        await captureScreen("worst-outline-80-end");
      },
      close: async (page) => { await page.locator(".editor-bar").getByRole("button", { name: translate("editor.outline") }).click(); },
    },
    {
      name: "worst-database-12-properties",
      capturesItself: true,
      open: async (page, { captureScreen }) => {
        await navigate(page, "openTab", `database:${seeded.ids.propertyNotebook}`);
        await page.locator(".database-view").waitFor();
        await captureScreen("worst-database-table");
        await page.getByRole("radio", { name: translate("database.layout.board") }).click();
        await captureScreen("worst-database-board");
      },
    },
    {
      name: "worst-search-300",
      capturesItself: true,
      open: async (page, { captureScreen }) => {
        await page.locator(".sidebar").getByRole("button", { name: translate("sidebar.search"), exact: true }).click();
        await page.getByPlaceholder(translate("sidebar.searchPlaceholder")).fill("検索テスト");
        await captureScreen("worst-search-300");
        await page.getByPlaceholder(translate("sidebar.searchPlaceholder")).fill("該当なしの言葉qqq");
        await captureScreen("worst-search-0");
      },
      close: async (page) => {
        await page.getByPlaceholder(translate("sidebar.searchPlaceholder")).fill("");
        await page.locator(".sidebar").getByRole("button", { name: translate("sidebar.search"), exact: true }).click();
      },
    },
    {
      name: "worst-palette-300",
      capturesItself: true,
      open: async (page, { captureScreen }) => {
        await page.keyboard.press("Control+K");
        await page.getByRole("dialog").waitFor();
        await page.keyboard.type("検索テスト");
        await captureScreen("worst-palette-300");
        await page.keyboard.press("Control+A");
        await page.keyboard.type("とても長い");
        await captureScreen("worst-palette-long-title");
      },
    },
    {
      name: "worst-trash-200",
      open: async (page) => { await page.locator(".sidebar .nav", { hasText: translate("sidebar.trash") }).first().click(); },
      close: async (page) => { await page.locator(".sidebar .nav", { hasText: translate("sidebar.trash") }).first().click(); },
    },
    {
      name: "worst-choose-notebooks-80",
      open: async (page) => {
        await openNote(page, seeded.ids.notes.properties);
        await openEditorMoreMenu(page);
        await page.getByRole("menuitem", { name: translate("editor.chooseNotebooks") }).click();
        await page.getByRole("dialog").waitFor();
      },
    },
    {
      name: "worst-link-picker-500",
      open: async (page) => {
        await openNote(page, seeded.ids.notes.properties);
        await placeCursorAtEnd(page);
        await page.keyboard.press("Enter");
        await page.keyboard.type("/link");
        await page.locator(".slash-menu").waitFor();
        await page.keyboard.press("Enter");
        await page.getByRole("dialog").waitFor();
      },
      close: async (page) => { await page.keyboard.press("Escape"); await page.keyboard.press("Backspace"); },
    },
    {
      name: "worst-ai-saved-chats",
      capturesItself: true,
      open: async (page, { captureScreen }) => {
        await openNote(page, seeded.ids.notes.properties);
        await page.keyboard.press("Control+Alt+A");
        const chat = page.locator(".ai-chat");
        await chat.waitFor();
        await chat.getByRole("button", { name: translate("ai.history") }).click();
        await captureScreen("worst-ai-saved-chats");
        await chat.getByText(WORST_CASE_TEXT.longChatTitle.slice(0, 10)).first().click();
        await captureScreen("worst-ai-long-conversation");
      },
      close: async (page) => { await page.keyboard.press("Control+Alt+A"); },
    },
    {
      name: "worst-toasts-5",
      open: async (page) => {
        await exposeApp(page);
        const titles = await page.evaluate((count) => window.__visualAudit.repository.notes()
          .filter((note) => note.content.trashedAt === null && note.content.title.startsWith("メモ 4")).slice(0, count).map((note) => note.content.title), TOAST_COUNT);
        await page.locator(".sidebar .nav", { hasText: translate("sidebar.allNotes") }).first().click();
        for (const title of titles) {
          const row = page.locator(".nav-row", { has: page.locator(".tree-note", { hasText: title }) }).first();
          await row.scrollIntoViewIfNeeded();
          await row.hover();
          await row.locator(".row-actions button").click();
          await page.getByRole("menuitem", { name: translate("editor.moveToTrash") }).click();
        }
      },
      // 閉じた知らせは、消える動きの間だけ操作を受けない写し（.leaving）を残すので、写しのボタンは押さない。
      close: async (page) => {
        const toastButtons = page.locator(".toast:not(.leaving) button");
        while (await toastButtons.count()) {
          await toastButtons.first().click();
        }
      },
    },
    { name: "worst-graph-500", open: async (page) => { await page.keyboard.press("Control+Alt+G"); await page.waitForTimeout(1500); } },
  ];
}

export function WORST_CASE_PHONE_SCREENS({ baseUrl, passphrase, phoneViewport }) {
  const selectPhoneTab = (page, index) => page.locator(".tabbar button").nth(index).click();
  // 開いているダイアログ（AI チャットなど）を閉じてから、一覧まで戻る。Esc で閉じないダイアログは、中の「閉じる」を押す。
  const backToList = async (page) => {
    if (await page.getByRole("dialog").count()) {
      await page.keyboard.press("Escape");
    }
    if (await page.getByRole("dialog").count()) {
      await page.getByRole("dialog").getByRole("button", { name: translate("common.close") }).first().click();
    }
    await page.getByRole("dialog").waitFor({ state: "detached" });
    while (await page.locator(".phone-back").count()) {
      await page.locator(".phone-back").first().click();
    }
    await selectPhoneTab(page, 0);
  };
  const openPhoneNote = async (page, key) => {
    await openNote(page, seeded.ids.notes[key]);
  };
  return [
    {
      name: "worst-phone-list",
      capturesItself: true,
      open: async (page, { captureScreen }) => {
        await page.setViewportSize(phoneViewport);
        await reloadAndUnlock(page, baseUrl, passphrase);
        await page.locator(".tabbar").waitFor();
        await captureScreen("worst-phone-list");
        await page.locator(".chips").evaluate((element) => { element.scrollLeft = element.scrollWidth; });
        await captureScreen("worst-phone-chips-end");
      },
    },
    {
      name: "worst-phone-search-300",
      open: async (page) => { await page.locator(".phone-search input").fill("検索テスト"); },
      close: async (page) => { await page.locator(".phone-search input").fill(""); },
    },
    {
      name: "worst-phone-library",
      capturesItself: true,
      open: async (page, { captureScreen }) => {
        await selectPhoneTab(page, 1);
        await captureScreen("worst-phone-library-top");
        await scrollTo(page, ".phone-scroll", "end");
        await captureScreen("worst-phone-library-end");
      },
      close: backToList,
    },
    {
      name: "worst-phone-trash-200",
      open: async (page) => { await selectPhoneTab(page, 1); await page.locator(".library-row", { hasText: translate("sidebar.trash") }).click(); },
      close: backToList,
    },
    ...["longTitleJa", "longTitleAscii", "emojiTitle", "manyTags", "wideTable", "longLines", "properties"].map((key) => ({
      name: `worst-phone-note-${key}`,
      open: (page) => openPhoneNote(page, key),
      close: backToList,
    })),
    {
      name: "worst-phone-choose-notebooks-80",
      open: async (page) => {
        await openPhoneNote(page, "properties");
        await openEditorMoreMenu(page);
        await page.getByRole("menuitem", { name: translate("editor.chooseNotebooks") }).click();
        await page.getByRole("dialog").waitFor();
      },
      close: backToList,
    },
    {
      name: "worst-phone-ai-long-conversation",
      open: async (page) => {
        await openPhoneNote(page, "properties");
        await openEditorMoreMenu(page);
        await page.getByRole("menuitem", { name: translate("ai.assistant") }).click();
        const chat = page.locator(".ai-chat");
        await chat.waitFor();
        await chat.getByRole("button", { name: translate("ai.history") }).click();
        await chat.getByText(WORST_CASE_TEXT.longChatTitle.slice(0, 10)).first().click();
      },
      close: backToList,
    },
  ];
}

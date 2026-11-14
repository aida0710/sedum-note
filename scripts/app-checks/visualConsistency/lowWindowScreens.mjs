// 低い窓で、メニューと候補が窓の中に収まるか（項目の多いメモの「…」、いちばん下の行のメニュー、本文の下の端の「/」）。
// 窓の高さだけを LOW_WINDOW_HEIGHT にして開き、閉じたら元の大きさに戻す。はみ出しは measureContainerFit.mjs が数える。

import { closeSlashMenu, openBlockMenu, openEditorMoreMenu, openSidebarNoteMenu, openSlashMenu } from "./appOperations.mjs";

// ノートパソコンでブラウザの窓を半分にしたときの高さの目安（2026-11-13 の点検で、メモの「…」の 18 項目が収まらなかった高さ）。
const LOW_WINDOW_HEIGHT = 520;

// open の前に窓を低くし、close のあとで戻す。
function inLowWindow(screen) {
  let originalSize = null;
  return {
    ...screen,
    name: `low-window-${screen.name}`,
    open: async (page, tools) => {
      originalSize = page.viewportSize();
      await page.setViewportSize({ width: originalSize.width, height: LOW_WINDOW_HEIGHT });
      await screen.open(page, tools);
    },
    close: async (page) => {
      try {
        if (screen.close) {
          await screen.close(page);
        } else {
          await page.keyboard.press("Escape");
          await page.keyboard.press("Escape");
        }
      } finally {
        await page.setViewportSize(originalSize);
      }
    },
  };
}

// openNote は、ブロックの種類がそろったメモ（auditScreens.mjs の見た目の確認のメモ）を開く関数。
export function LOW_WINDOW_SCREENS({ openNote }) {
  return [
    { name: "note-actions-menu", open: async (page) => { await openNote(page); await openEditorMoreMenu(page); } },
    {
      name: "sidebar-menu-last-row",
      open: async (page) => {
        await page.locator(".sidebar-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
        const lastRow = page.locator(".sidebar .nav-row:has(button[aria-haspopup=menu])").last();
        await lastRow.hover();
        await lastRow.locator("button[aria-haspopup=menu]").first().click();
        await page.getByRole("menu").waitFor();
      },
    },
    { name: "sidebar-note-menu", open: (page) => openSidebarNoteMenu(page, "沖縄旅行の持ち物") },
    { name: "slash-menu-at-end", open: async (page) => { await openNote(page); await openSlashMenu(page); }, close: closeSlashMenu },
    { name: "tab-list", open: async (page) => { await page.locator(".tabs-bar").getByRole("button", { name: "開いているタブの一覧" }).click(); await page.getByRole("menu").waitFor(); } },
    {
      name: "block-menu-near-bottom",
      open: async (page) => {
        await openNote(page);
        await openBlockMenu(page, page.locator(".ProseMirror > p").last());
      },
    },
  ].map(inLowWindow);
}

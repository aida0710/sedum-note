// 仮のタブ（左の列でメモを普通に押して開くタブ）。次に押したメモと入れ替わり、題を斜体で出し、書く・ダブルクリック・
// ピン留め・並べ替えで普通のタブになる。

import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, PASSPHRASE, startLocalVault } from "./devices";

function sidebarNote(page: Page, title: string) {
  return page.locator(".sidebar .tree-note", { hasText: title }).first();
}

// タブの読み上げの名前は、題と「×」（タブを閉じる）。ピン留めしたタブは題だけ。
function tabOf(page: Page, title: string) {
  return page.getByRole("tab", { name: new RegExp(`^${title}( タブを閉じる)?$`) });
}

async function expectPreviewTab(page: Page, title: string): Promise<void> {
  await expect(tabOf(page, title)).toHaveClass(/\bpreview\b/);
  await expect(tabOf(page, title).locator(".tab-label")).toHaveCSS("font-style", "italic");
}

async function expectKeptTab(page: Page, title: string): Promise<void> {
  await expect(tabOf(page, title)).not.toHaveClass(/\bpreview\b/);
  await expect(tabOf(page, title).locator(".tab-label")).toHaveCSS("font-style", "normal");
}

// メモを作り（作ったメモは普通のタブで開く）、タブを全部閉じて、左の列から開く前の状態にする。
async function createNotesWithoutTabs(page: Page, titles: string[]): Promise<void> {
  await startLocalVault(page);
  for (const title of titles) {
    await createNoteOnDesktop(page, title);
  }
  // 閉じる「×」は、選んでいるタブにだけ出ている。閉じると隣のタブが選ばれるので、選んでいるタブを順に閉じる。
  for (let closedCount = 0; closedCount < titles.length; closedCount += 1) {
    await page.locator(".tab.on").getByRole("button", { name: "タブを閉じる" }).click();
  }
  await expect(page.getByRole("tab")).toHaveCount(0);
}

// メモを開いたあとの保存（PERSIST_DELAY_MILLISECONDS は 150ms）が済むまで待つ。開いただけで書き込みが起きて
// 普通のタブになってしまう不具合があれば、この間に出る。
const AFTER_OPENING_WAIT_MILLISECONDS = 600;

test("左の列でメモを押すと、題が斜体の仮のタブで開き、次に押したメモと入れ替わる。もう開いているメモは選ぶだけ", async ({ page }) => {
  await createNotesWithoutTabs(page, ["一", "二", "三"]);

  await sidebarNote(page, "一").click();
  await expectPreviewTab(page, "一");
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("一");
  await page.waitForTimeout(AFTER_OPENING_WAIT_MILLISECONDS);
  await sidebarNote(page, "二").click();
  await expect(page.getByRole("tab")).toHaveText(["二"]);
  await expectPreviewTab(page, "二");

  // 普通のタブで開いているメモを左の列で押しても、そのタブを選ぶだけで、仮のタブは残る。
  await createNoteOnDesktop(page, "四");
  await expect(page.getByRole("tab")).toHaveText(["二", "四"]);
  await sidebarNote(page, "四").click();
  await sidebarNote(page, "三").click();
  await expect(page.getByRole("tab")).toHaveText(["三", "四"]);
  await expectPreviewTab(page, "三");
  // タブを押して移っても、仮のタブのまま。
  await tabOf(page, "四").click();
  await tabOf(page, "三").click();
  await expectPreviewTab(page, "三");
});

test("仮のタブのメモの本文か題を書くと、普通のタブになり、次に押したメモは新しいタブで開く", async ({ page }) => {
  await createNotesWithoutTabs(page, ["本文を書く", "題を書く", "あとで開く"]);

  await sidebarNote(page, "本文を書く").click();
  await expectPreviewTab(page, "本文を書く");
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.type("書いた");
  await expectKeptTab(page, "本文を書く");

  await sidebarNote(page, "題を書く").click();
  await expect(page.getByRole("tab")).toHaveText(["本文を書く", "題を書く"]);
  await expectPreviewTab(page, "題を書く");
  await page.getByPlaceholder("タイトル").press("End");
  await page.keyboard.type("た");
  await expectKeptTab(page, "題を書くた");

  await sidebarNote(page, "あとで開く").click();
  await expect(page.getByRole("tab")).toHaveText(["本文を書く", "題を書くた", "あとで開く"]);
});

test("仮のタブをダブルクリックするか、左の列の行をダブルクリックすると、普通のタブになる", async ({ page }) => {
  await createNotesWithoutTabs(page, ["タブで残す", "行で残す", "三つ目"]);

  await sidebarNote(page, "タブで残す").click();
  await tabOf(page, "タブで残す").dblclick();
  await expectKeptTab(page, "タブで残す");

  // 行のダブルクリックは、名前の変更も始める（Escape でやめる）。
  await sidebarNote(page, "行で残す").dblclick();
  await expect(page.locator(".sidebar .inline-input")).toBeFocused();
  await page.keyboard.press("Escape");
  await expectKeptTab(page, "行で残す");

  await sidebarNote(page, "三つ目").click();
  await expect(page.getByRole("tab")).toHaveText(["タブで残す", "行で残す", "三つ目"]);
});

test("仮のタブをピン留めするか、ドラッグで並べ替えると、普通のタブになる", async ({ page }) => {
  await createNotesWithoutTabs(page, ["ピン留めする", "並べ替える", "三つ目"]);

  await sidebarNote(page, "ピン留めする").click();
  await tabOf(page, "ピン留めする").click({ button: "right" });
  await page.getByRole("menuitem", { name: "タブをピン留め" }).click();
  await expect(tabOf(page, "ピン留めする")).not.toHaveClass(/\bpreview\b/);

  await createNoteOnDesktop(page, "四");
  await sidebarNote(page, "並べ替える").click();
  await expect(page.getByRole("tab")).toHaveText([/ピン留めする/, "四", "並べ替える"]);
  await expectPreviewTab(page, "並べ替える");
  await tabOf(page, "並べ替える").dragTo(tabOf(page, "四"));
  await expect(page.getByRole("tab")).toHaveText([/ピン留めする/, "並べ替える", "四"]);
  await expectKeptTab(page, "並べ替える");

  await sidebarNote(page, "三つ目").click();
  await expect(page.getByRole("tab")).toHaveText([/ピン留めする/, "並べ替える", "四", "三つ目"]);
});

test("中クリックは、仮のタブを残したまま、新しい普通のタブで開く", async ({ page }) => {
  await createNotesWithoutTabs(page, ["仮で開く", "中クリック"]);

  await sidebarNote(page, "仮で開く").click();
  await sidebarNote(page, "中クリック").click({ button: "middle" });
  await expect(page.getByRole("tab")).toHaveText(["仮で開く", "中クリック"]);
  await expectPreviewTab(page, "仮で開く");
  await expectKeptTab(page, "中クリック");
  await expect(tabOf(page, "中クリック")).toHaveAttribute("aria-selected", "true");
});

test("コマンドパレットと左の列の検索の結果から開いたメモは、普通のタブで開く", async ({ page }) => {
  await createNotesWithoutTabs(page, ["パレットで開く", "検索で開く", "仮で開く"]);

  await sidebarNote(page, "仮で開く").click();
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "コマンドパレット" });
  await palette.getByRole("combobox").fill("パレットで開く");
  await palette.getByRole("option", { name: /^パレットで開く/ }).click();
  await expect(page.getByRole("tab")).toHaveText(["仮で開く", "パレットで開く"]);
  await expectKeptTab(page, "パレットで開く");

  await page.keyboard.press("Control+Shift+f");
  await page.getByPlaceholder("メモを検索").fill("検索で開く");
  await expect(page.getByText("検索結果（1件）")).toBeVisible();
  await sidebarNote(page, "検索で開く").click();
  await expect(page.getByRole("tab")).toHaveText(["仮で開く", "パレットで開く", "検索で開く"]);
  await expectKeptTab(page, "検索で開く");
  await expectPreviewTab(page, "仮で開く");
});

test("読み込み直して解除しても、仮のタブは仮のタブのまま戻り、次に押したメモと入れ替わる", async ({ page }) => {
  await createNotesWithoutTabs(page, ["残す", "仮で開く", "入れ替える"]);
  await sidebarNote(page, "残す").click();
  await tabOf(page, "残す").dblclick();
  await sidebarNote(page, "仮で開く").click();
  await expectPreviewTab(page, "仮で開く");

  await page.reload();
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "解除" }).click();
  await expect(page.getByRole("tab")).toHaveText(["残す", "仮で開く"]);
  await expectPreviewTab(page, "仮で開く");
  await expectKeptTab(page, "残す");

  await sidebarNote(page, "入れ替える").click();
  await expect(page.getByRole("tab")).toHaveText(["残す", "入れ替える"]);
});

import { expect, type Page, test } from "@playwright/test";
import { addNotebookOnDesktop, createNoteOnDesktop, PASSPHRASE, PHONE_VIEWPORT, startLocalVault } from "./devices";

async function unlockApp(page: Page): Promise<void> {
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "解除" }).click();
}

test("Ctrl+L でアプリをロックできる。直前に打った文字も、解除すると残っている", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  await page.keyboard.type("牛乳を買う");
  await page.keyboard.press("Control+l");
  await expect(page.getByRole("heading", { name: "ロックを解除" })).toBeVisible();
  await expect(page.getByText("牛乳を買う")).toHaveCount(0);

  await unlockApp(page);
  await page.getByRole("button", { name: /買い物/ }).first().click();
  await expect(page.locator(".ProseMirror")).toHaveText("牛乳を買う");
});

test("ロックの直前に出ていた「元に戻す」の知らせは、ロックの画面に残さない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "捨てるメモ");
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "ゴミ箱に入れる" }).click();
  const toast = page.getByRole("status").filter({ hasText: "ゴミ箱に入れました" });
  await expect(toast).toBeVisible();
  await page.keyboard.press("Control+l");
  await expect(page.getByRole("heading", { name: "ロックを解除" })).toBeVisible();
  // 残すと、ロックの画面から「元に戻す」で、ロックしたメモを書き換えられてしまう。知らせは 6 秒で消えるので、それより前に見る。
  await expect(toast).toHaveCount(0, { timeout: 1_000 });
});

const gate = (page: Page) => page.getByRole("region", { name: "ロックしたメモ" });

async function lockOpenNote(page: Page): Promise<void> {
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "メモをロック" }).click();
}

async function passGate(page: Page, passphrase = PASSPHRASE): Promise<void> {
  await gate(page).getByLabel("パスフレーズ").fill(passphrase);
  await gate(page).getByRole("button", { name: "開く" }).click();
}

test("ロックしたメモは、パスフレーズを確かめるまで題だけが出る。タブを閉じると、また確認が要る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "日記");
  await page.keyboard.type("今日は海へ行った #秘密");
  await lockOpenNote(page);
  await expect(gate(page)).toContainText("日記");
  await expect(page.locator(".ProseMirror")).toHaveCount(0);
  await expect(page.locator(".tree-note", { hasText: "日記" }).first().getByLabel("ロック中")).toBeVisible();
  // 本文の言葉とタグでは、見つからない。題では見つかる。
  await expect(page.getByText("#秘密")).toHaveCount(0);
  await page.keyboard.press("Control+Shift+f");
  await page.getByPlaceholder("メモを検索").fill("海へ");
  await expect(page.getByText("検索結果（0件）")).toBeVisible();
  await page.getByPlaceholder("メモを検索").fill("日記");
  await expect(page.getByText("検索結果（1件）")).toBeVisible();
  await page.getByPlaceholder("メモを検索").fill("");

  await passGate(page, "wrong passphrase");
  await expect(gate(page).getByRole("alert")).toBeVisible();
  await passGate(page);
  await expect(page.locator(".ProseMirror")).toHaveText("今日は海へ行った #秘密");

  await page.keyboard.press("Control+Alt+w");
  await page.locator(".tree-note", { hasText: "日記" }).first().click();
  await expect(gate(page)).toBeVisible();
  // 開いているメモのメニューから、ロックを外せる。
  await passGate(page);
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "メモのロックを外す" }).click();
  await page.keyboard.press("Control+Alt+w");
  await page.locator(".tree-note", { hasText: "日記" }).first().click();
  await expect(page.locator(".ProseMirror")).toHaveText("今日は海へ行った #秘密");
});

test("ノートブックをロックすると、中のメモがロックされる。ロックを外すには、パスフレーズが要る", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "家計");
  await page.getByRole("button", { name: /^家計/ }).click();
  await createNoteOnDesktop(page, "口座");
  await page.keyboard.type("残高の控え");
  const notebookRow = page.locator(".nav-row", { has: page.locator(".nav", { hasText: "家計" }) }).first();
  await notebookRow.click({ button: "right" });
  await page.getByRole("menuitem", { name: "ノートブックをロック" }).click();
  await expect(gate(page)).toContainText("口座");

  await notebookRow.click({ button: "right" });
  await page.getByRole("menuitem", { name: "ノートブックのロックを外す" }).click();
  const confirmation = page.getByRole("dialog", { name: /ロックを外すには/ });
  await confirmation.getByRole("button", { name: "キャンセル" }).click();
  await expect(gate(page)).toBeVisible();

  await notebookRow.click({ button: "right" });
  await page.getByRole("menuitem", { name: "ノートブックのロックを外す" }).click();
  await confirmation.getByLabel("パスフレーズ").fill(PASSPHRASE);
  await confirmation.getByRole("button", { name: "確認" }).click();
  await expect(page.locator(".ProseMirror")).toHaveText("残高の控え");
});

test("ロックしたメモの中身は、埋め込みに出ず、ブロックの指定の相手にも選べない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "計画");
  await page.keyboard.type("宿は駅前");
  await createNoteOnDesktop(page, "メモ");
  await page.keyboard.type("/うめこみ");
  await page.getByRole("listbox", { name: "ブロックの種類" }).getByRole("option", { name: "ブロックの埋め込み（ほかのメモの一部を出す）" }).click();
  await page.getByRole("dialog", { name: "ブロックのあるメモを選ぶ" }).getByRole("button", { name: "計画" }).click();
  await page.getByRole("dialog", { name: "「計画」の中のブロックを選ぶ" }).getByRole("button", { name: "宿は駅前" }).click();
  await expect(page.locator(".block-embed")).toContainText("宿は駅前");

  await page.getByRole("tab", { name: "計画" }).click();
  await lockOpenNote(page);
  await page.getByRole("tab", { name: "メモ" }).click();
  await expect(page.locator(".block-embed")).toContainText("ロックしたメモの中身は、ここには出しません。");
  await expect(page.locator(".block-embed")).not.toContainText("宿は駅前");
  // ブロックの指定の相手にも選べない。
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("/うめこみ");
  await page.getByRole("listbox", { name: "ブロックの種類" }).getByRole("option", { name: "ブロックの埋め込み（ほかのメモの一部を出す）" }).click();
  await expect(page.getByRole("dialog", { name: "ブロックのあるメモを選ぶ" }).getByRole("button", { name: "計画" })).toHaveCount(0);
});

test("スマホの画面でも、ロックしたメモは確認のあとで開く。戻るで一覧へ戻ると、また確認が要る", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill("日記");
  await page.getByPlaceholder("タイトル").press("Enter");
  await page.keyboard.type("今日は海へ行った");
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "メモをロック" }).click();
  await expect(gate(page)).toContainText("日記");
  await gate(page).getByRole("button", { name: "戻る" }).click();
  // 一覧には、題だけが出る。
  await expect(page.locator(".note-item")).toContainText("日記");
  await expect(page.locator(".note-item")).not.toContainText("海へ");

  await page.locator(".note-item").click();
  await passGate(page);
  await expect(page.locator(".ProseMirror")).toHaveText("今日は海へ行った");
  await page.getByRole("button", { name: "戻る" }).click();
  await page.locator(".note-item").click();
  await expect(gate(page)).toBeVisible();
});

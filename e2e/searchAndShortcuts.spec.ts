import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, startLocalVault } from "./devices";

async function newNote(page: Page, title: string, body: string): Promise<void> {
  await createNoteOnDesktop(page, title);
  await page.keyboard.type(body);
}

test("Ctrl+F でメモの中を検索でき、当たりに色が付いて、Enter で次の当たりへ移る", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "検索の試し", "りんご と みかん。りんご の木。");
  await page.keyboard.press("Control+f");
  const find = page.getByRole("search");
  await find.getByRole("textbox").fill("りんご");
  await expect(page.locator(".ProseMirror .search-match")).toHaveCount(2);
  await expect(find).toContainText("1 / 2");
  await find.getByRole("textbox").press("Enter");
  await expect(find).toContainText("2 / 2");
  await expect(page.locator(".ProseMirror .search-match.active")).toHaveCount(1);
  await find.getByRole("textbox").press("Escape");
  await expect(page.getByRole("search")).toHaveCount(0);
  await expect(page.locator(".ProseMirror .search-match")).toHaveCount(0);
  // 色は表示だけで、本文は変わっていない。
  await expect(page.locator(".ProseMirror")).toHaveText("りんご と みかん。りんご の木。");
});

test("一覧の検索で開いたメモは、探した言葉に色が付く。ノートブックを開いていれば、まずその中を探す", async ({ page }) => {
  await startLocalVault(page);
  await page.getByRole("button", { name: "ノートブックを追加" }).click();
  await page.getByPlaceholder("ノートブックの名前").fill("旅行");
  await page.getByPlaceholder("ノートブックの名前").press("Enter");
  await newNote(page, "ノートブックの外", "持ち物の一覧");
  await page.getByRole("button", { name: /^旅行/ }).click();
  await newNote(page, "沖縄", "持ち物は水着");

  await page.keyboard.press("Control+Shift+f");
  await page.getByPlaceholder("メモを検索").fill("持ち物");
  await expect(page.getByText("検索結果（1件）")).toBeVisible();
  await page.getByRole("button", { name: /「旅行」の中を検索しています/ }).click();
  await expect(page.getByText("検索結果（2件）")).toBeVisible();
  await page.locator(".tree-note", { hasText: "ノートブックの外" }).click();
  await expect(page.locator(".ProseMirror .search-match")).toHaveText("持ち物");
});

test("ショートカットで、新しいメモ・タブの切り替え・タブを閉じる・設定ができる。ダイアログが開いている間は効かない", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "1 つ目", "");
  await page.keyboard.press("Control+Alt+n");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.getByPlaceholder("タイトル").fill("2 つ目");

  await page.keyboard.press("Control+Alt+ArrowLeft");
  await expect(page.getByRole("tab", { selected: true })).toHaveText("1 つ目");
  await page.keyboard.press("Control+Alt+ArrowRight");
  await expect(page.getByRole("tab", { selected: true })).toHaveText("2 つ目");
  await page.keyboard.press("Control+Alt+w");
  await expect(page.getByRole("tab")).toHaveText(["1 つ目"]);

  await page.keyboard.press("Control+,");
  await expect(page.getByRole("heading", { name: "キーボードショートカット" })).toBeVisible();
  await expect(page.locator(".shortcut-list")).toContainText("Ctrl + Alt + N");

  await page.getByRole("button", { name: "このデバイスのデータを消す" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Control+Alt+n");
  await expect(page.getByRole("tab")).toHaveCount(2);
});

import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, startLocalVault } from "./devices";

async function openNewNote(page: Page): Promise<void> {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "ブロックの試し");
}

const slashMenu = (page: Page) => page.getByRole("listbox", { name: "ブロックの種類" });

test("「/」を打つとブロックの候補が出て、上下のキーと Enter で選べる", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("/");
  await expect(slashMenu(page).getByRole("option")).toHaveText([
    "本文", "見出し 1", "見出し 2", "見出し 3", "箇条書き", "番号付きリスト", "チェックリスト", "引用", "コード", "表", "区切り線", "画像を貼る", "ファイルを添付", "メモへのリンク",
  ]);
  await page.keyboard.press("ArrowDown");
  await expect(slashMenu(page).getByRole("option", { name: "見出し 1" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(slashMenu(page)).toHaveCount(0);
  await page.keyboard.type("大きな見出し");
  // 打った「/」は残らない。
  await expect(page.locator(".ProseMirror h1")).toHaveText("大きな見出し");
});

test("「/」のあとに打った文字で候補を絞り込める（文言でも、英語の言葉でも）", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("/表");
  await expect(slashMenu(page).getByRole("option")).toHaveText(["表"]);
  await page.keyboard.press("Enter");
  await expect(page.locator(".ProseMirror table tr")).toHaveCount(3);
  await expect(page.locator(".ProseMirror")).not.toContainText("/表");

  await page.keyboard.press("Control+End");
  await page.keyboard.type("/todo");
  await expect(slashMenu(page).getByRole("option")).toHaveText(["チェックリスト"]);
  await page.keyboard.press("Enter");
  await page.keyboard.type("牛乳を買う");
  await expect(page.locator('.ProseMirror ul[data-type="taskList"] li > div')).toHaveText("牛乳を買う");
});

test("候補を押して選べ、文の途中の「/」からも出せる。全角の「／」でも出る", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("メモ /");
  await slashMenu(page).getByRole("option", { name: "区切り線" }).click();
  await expect(page.locator(".ProseMirror hr")).toHaveCount(1);
  await expect(page.locator(".ProseMirror p").first()).toHaveText("メモ");

  await page.keyboard.type("／");
  await slashMenu(page).getByRole("option", { name: "引用" }).click();
  await page.keyboard.type("引用した文");
  await expect(page.locator(".ProseMirror blockquote")).toHaveText("引用した文");
});

test("Escape で候補を閉じると「/」はそのまま残り、コードの中と URL の「/」では候補を出さない", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("/");
  await expect(slashMenu(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(slashMenu(page)).toHaveCount(0);
  await expect(page.locator(".ProseMirror p").first()).toHaveText("/");

  await page.keyboard.press("Enter");
  await page.keyboard.type("https://example.com/path");
  await expect(slashMenu(page)).toHaveCount(0);

  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "コード", exact: true }).click();
  await page.keyboard.type("a / b");
  await expect(slashMenu(page)).toHaveCount(0);
  await expect(page.locator(".ProseMirror pre")).toHaveText("a / b");
});

test("候補から「メモへのリンク」を選ぶと、リンクするメモを選ぶ画面が開く", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("/りんく");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "リンクするメモを選ぶ" })).toBeVisible();
});

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
    "本文", "見出し 1", "見出し 2", "見出し 3", "見出し 4", "見出し 5", "見出し 6", "箇条書き", "番号付きリスト", "チェックリスト", "引用",
    "コールアウト: 情報", "コールアウト: ヒント", "コールアウト: 注意", "コールアウト: 警告", "コード", "表", "区切り線",
    "画像を貼る", "ファイルを添付", "今日の日付", "今の日時", "クエリ（条件に合うメモの一覧）", "メモへのリンク",
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

test("「/」からコールアウトを作れ、中に文字を書ける。別の種類を選ぶと色が変わる", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("/こーるあうと");
  await slashMenu(page).getByRole("option", { name: "コールアウト: 注意" }).click();
  await page.keyboard.type("火を止める");
  const callout = page.locator(".ProseMirror .callout");
  await expect(callout).toHaveText("火を止める");
  await expect(callout).toHaveAttribute("data-callout", "warning");

  await page.keyboard.type(" /こーるあうと");
  await slashMenu(page).getByRole("option", { name: "コールアウト: 警告" }).click();
  await expect(callout).toHaveCount(1);
  await expect(callout).toHaveAttribute("data-callout", "danger");
});

test("クエリのブロックは、条件に合うメモの一覧を出し、条件を変えると一覧が変わる。押すとそのメモが開く", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "旅行の持ち物");
  await page.keyboard.type("パスポート #旅行");
  await createNoteOnDesktop(page, "買い物");
  await page.keyboard.type("牛乳");
  await createNoteOnDesktop(page, "まとめ");
  await page.keyboard.type("/くえり");
  await page.keyboard.press("Enter");

  const query = page.locator(".ProseMirror .note-query");
  await expect(query.locator(".note-query-results .menu-item")).toHaveCount(3);
  await query.getByRole("combobox", { name: "タグ" }).selectOption("旅行");
  await expect(query.locator(".note-query-results .menu-item")).toHaveText(["旅行の持ち物"]);
  await query.getByRole("combobox", { name: "タグ" }).selectOption("");
  await query.getByRole("textbox", { name: "含まれる言葉" }).fill("牛乳");
  await expect(query.locator(".note-query-results .menu-item")).toHaveText(["買い物"]);
  await query.locator(".note-query-results .menu-item").click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("買い物");
});

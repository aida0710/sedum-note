import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, startLocalVault } from "./devices";

const splitPane = (page: Page) => page.getByRole("region", { name: "右に並べたメモ" });
const leftBody = (page: Page) => page.locator(".pane:not(.split-pane) .ProseMirror");

test("メモを右に並べて開くと、左で別のメモを開いても、右のメモは開いたまま。右で書いた文字は、そのメモに入る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "資料");
  await page.keyboard.type("去年の数字");
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "右に並べて開く" }).click();
  await expect(splitPane(page).locator(".ProseMirror")).toHaveText("去年の数字");

  // 左で別のメモを作る。右は「資料」のまま。
  await page.getByRole("button", { name: "新しいメモ" }).click();
  const leftTitle = page.locator(".pane:not(.split-pane)").getByPlaceholder("タイトル");
  await expect(leftTitle).toHaveValue("");
  await leftTitle.fill("報告");
  await leftTitle.press("Enter");
  await page.keyboard.type("今年の数字");
  await expect(leftBody(page)).toHaveText("今年の数字");
  await expect(splitPane(page).locator(".split-pane-header")).toContainText("資料");
  await expect(splitPane(page).locator(".ProseMirror")).toHaveText("去年の数字");

  // 右のメモに書くと、左で同じメモを開いたときにも入っている。
  await splitPane(page).locator(".ProseMirror").click();
  await page.keyboard.press("End");
  await page.keyboard.type("（確定）");
  await expect(splitPane(page).locator(".ProseMirror")).toHaveText("去年の数字（確定）");
  await splitPane(page).getByRole("button", { name: "右に並べたメモを閉じる" }).click();
  await expect(splitPane(page)).toHaveCount(0);
  await page.getByRole("tab", { name: "資料" }).click();
  await expect(leftBody(page)).toHaveText("去年の数字（確定）");
});

test("タブのメニューからも、そのタブのメモを右に並べて開ける", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "資料");
  await createNoteOnDesktop(page, "報告");
  await page.getByRole("tab", { name: "資料" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "右に並べて開く" }).click();
  await expect(splitPane(page).locator(".split-pane-header")).toContainText("資料");
  await expect(page.getByRole("tab", { name: "報告" })).toHaveAttribute("aria-selected", "true");
});

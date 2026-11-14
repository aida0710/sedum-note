import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, PASSPHRASE, startLocalVault } from "./devices";

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
  await page.getByRole("menuitem", { name: "ゴミ箱に移動" }).click();
  const toast = page.getByRole("status").filter({ hasText: "ゴミ箱に移動しました" });
  await expect(toast).toBeVisible();
  await page.keyboard.press("Control+l");
  await expect(page.getByRole("heading", { name: "ロックを解除" })).toBeVisible();
  // 残すと、ロックの画面から「元に戻す」で、ロックしたあとのメモを書き換えられてしまう。知らせは 6 秒で消えるので、それより前に見る。
  await expect(toast).toHaveCount(0, { timeout: 1_000 });
});

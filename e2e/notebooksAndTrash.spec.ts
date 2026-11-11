import { expect, type Page, test } from "@playwright/test";
import { startLocalVault } from "./devices";

async function addNotebook(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "ノートブックを追加" }).click();
  await page.getByPlaceholder("ノートブックの名前").fill(name);
  await page.getByPlaceholder("ノートブックの名前").press("Enter");
}

test("ノートブックの色とアイコンを選ぶと、左の列の印が変わり、開き直しても保たれる", async ({ page }) => {
  await startLocalVault(page);
  await addNotebook(page, "旅行");
  const row = page.locator(".nav-row", { hasText: "旅行" });
  // 選ぶ前は、自動の色（1 つ目は青）の点。
  await expect(row.locator(".dot")).toHaveCSS("background-color", "rgb(47, 111, 222)");

  await row.hover();
  await row.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "色とアイコン" }).click();
  const dialog = page.getByRole("dialog", { name: "色とアイコン" });
  await dialog.getByRole("radio", { name: "緑", exact: true }).click();
  await dialog.getByRole("radio", { name: "plane" }).click();
  await dialog.getByRole("button", { name: "閉じる" }).click();
  await expect(row.locator("svg.notebook-icon")).toHaveAttribute("stroke", "#2da44e");

  await page.waitForTimeout(500);
  await page.reload();
  await page.getByLabel("パスフレーズ").fill("correct horse battery");
  await page.getByRole("button", { name: "解除" }).click();
  await expect(page.locator(".nav-row", { hasText: "旅行" }).locator("svg.notebook-icon")).toHaveAttribute("stroke", "#2da44e");
});

test("ゴミ箱の自動削除は、既定ではオフ。日数を決めると、過ぎたメモがロック解除のときに完全に削除される", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-01T09:00:00+09:00") });
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill("捨てるメモ");
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "ゴミ箱に入れる" }).click();
  const trashCount = page.locator(".nav-row", { hasText: "ゴミ箱" }).locator(".count");
  await expect(trashCount).toHaveText("1");

  await page.locator(".sync-line").click();
  const autoDelete = page.getByLabel("ゴミ箱のメモを、日数がたったら完全に削除する");
  await expect(autoDelete).not.toBeChecked();
  await autoDelete.check();
  await page.getByLabel("ゴミ箱に残す日数").fill("0");
  await expect(page.getByRole("alert")).toContainText("1〜3650 の整数");

  // 捨ててから 5 日後に、日数を「7」と 1 文字ずつ打つ…のではなく「70」と打つ。途中の「7」では確定しない
  // （確定していたら、まだ残すはずのメモは消えないが、「3」のような短い途中の値では消えてしまう）。
  await page.clock.fastForward(5 * 24 * 60 * 60 * 1000);
  await page.getByLabel("ゴミ箱に残す日数").fill("");
  await page.getByLabel("ゴミ箱に残す日数").pressSequentially("30");
  await page.clock.runFor(1_000);
  // 途中の「3」（3 日）で確定していたら、5 日前に捨てたメモはここで消えている。
  await expect(trashCount).toHaveText("1");
  await page.getByLabel("ゴミ箱に残す日数").fill("7");
  await page.getByLabel("ゴミ箱に残す日数").blur();
  await expect(page.getByText("今の設定は 7 日です")).toBeVisible();
  await page.clock.runFor(1_000);
  // まだ 7 日たっていないので残る。
  await expect(trashCount).toHaveText("1");

  await page.clock.fastForward(3 * 24 * 60 * 60 * 1000);
  await page.reload();
  await page.getByLabel("パスフレーズ").fill("correct horse battery");
  await page.getByRole("button", { name: "解除" }).click();
  await expect(page.locator(".nav-row", { hasText: "ゴミ箱" }).locator(".count")).toHaveText("0");
});

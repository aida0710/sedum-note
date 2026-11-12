import { expect, test } from "@playwright/test";
import { PHONE_VIEWPORT, startLocalVault } from "./devices";

test("PC では左下の歯車で設定を開き、同期の状態を押すと同期のページが開く", async ({ page }) => {
  await startLocalVault(page);
  const settingsPages = page.getByRole("navigation", { name: "設定のページ" });

  await page.getByRole("button", { name: "設定", exact: true }).click();
  await expect(settingsPages.getByRole("button", { name: "一般", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "表示" })).toBeVisible();

  await page.locator(".sync-line").click();
  await expect(settingsPages.getByRole("button", { name: "同期", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("エンドポイント")).toBeVisible();
});

test("スマホの設定は、ページの一覧から開いて「設定」で戻る。ページを開いたまま下のタブで移ると、積んだ「戻る」の履歴も外れる", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(page);
  const tabbar = page.locator(".tabbar");
  const settingsPages = page.getByRole("navigation", { name: "設定のページ" });
  // 開いたページが積む履歴の印（useBackGestureToClose）。無ければ null。
  const historyMark = () => page.evaluate(() => (window.history.state as { mark?: string } | null)?.mark ?? null);

  await tabbar.getByRole("button", { name: "設定" }).click();
  await settingsPages.getByRole("button", { name: /外観/ }).click();
  await expect(page.getByRole("heading", { name: "テーマ" })).toBeVisible();
  await page.locator(".phone-back").click();
  await expect(settingsPages).toBeVisible();
  await expect.poll(historyMark).toBeNull();

  // 端末の「戻る」でも、ページの一覧へ戻る。
  await settingsPages.getByRole("button", { name: /同期/ }).click();
  await expect(page.getByLabel("エンドポイント")).toBeVisible();
  await page.goBack();
  await expect(settingsPages).toBeVisible();

  await settingsPages.getByRole("button", { name: /同期/ }).click();
  await expect.poll(historyMark).not.toBeNull();
  await tabbar.getByRole("button", { name: "メモ" }).click();
  await expect.poll(historyMark).toBeNull();
  // 設定へ戻ると、ページの一覧から始まる。
  await tabbar.getByRole("button", { name: "設定" }).click();
  await expect(settingsPages).toBeVisible();
});

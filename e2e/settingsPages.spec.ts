import { expect, type Page, test } from "@playwright/test";
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

// 設定の項目の、名前（label）と欄の位置。
async function nameAndControlBoxes(page: Page, name: string) {
  const nameBox = await page.locator("label", { hasText: name }).boundingBox();
  const controlBox = await page.getByLabel(name).boundingBox();
  if (!nameBox || !controlBox) {
    throw new Error(`「${name}」の名前か欄が見えていない`);
  }
  return { nameBox, controlBox };
}

test("PC の広い画面では、選択欄とチェックを名前の右に並べる。説明は欄の説明として読み上げる", async ({ page }) => {
  await startLocalVault(page);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await expect(page.getByLabel("本文の配置の既定")).toHaveAccessibleDescription("メモの「…」の「本文の配置」で、メモごとに変えられます。");

  for (const name of ["本文の配置の既定", "打っている行を中央に保つ（タイプライターモード）"]) {
    const { nameBox, controlBox } = await nameAndControlBoxes(page, name);
    expect(controlBox.x).toBeGreaterThan(nameBox.x + nameBox.width);
    // 名前の縦の中央が、欄の上の端と下の端の間にある（同じ行に並んでいる）。
    const nameMiddle = nameBox.y + nameBox.height / 2;
    expect(nameMiddle).toBeGreaterThan(controlBox.y);
    expect(nameMiddle).toBeLessThan(controlBox.y + controlBox.height);
  }
});

test("スマホでは、選択欄を今までどおり名前の下に出し、チェックの印は名前の左に置く。スマホに無い「本文の配置」の既定は出さない", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(page);
  await page.locator(".tabbar").getByRole("button", { name: "設定" }).click();
  await page.getByRole("navigation", { name: "設定のページ" }).getByRole("button", { name: /一般/ }).click();

  const sortOrder = await nameAndControlBoxes(page, "メモの並び順");
  expect(sortOrder.controlBox.y).toBeGreaterThanOrEqual(sortOrder.nameBox.y + sortOrder.nameBox.height);
  await expect(page.getByLabel("本文の配置の既定")).toHaveCount(0);
  const typewriterMode = await nameAndControlBoxes(page, "打っている行を中央に保つ（タイプライターモード）");
  expect(typewriterMode.controlBox.x + typewriterMode.controlBox.width).toBeLessThanOrEqual(typewriterMode.nameBox.x);
});

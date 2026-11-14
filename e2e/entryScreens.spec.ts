import { expect, test } from "@playwright/test";
import { PASSPHRASE, startLocalVault } from "./devices";

test("最初の画面は、題の上にアプリのアイコンと名前を出し、鍵のアイコンは出さない", async ({ page }) => {
  await page.goto("/");
  const card = page.locator(".entry-card");
  await expect(card.locator(".entry-brand")).toHaveText("Sedum Note");
  await expect(card.locator(".entry-brand img")).toHaveAttribute("src", /app-icon\.svg$/);
  await expect(card.getByRole("heading", { name: "メモを始める" }).locator("svg")).toHaveCount(0);
});

test("同期の欄を開いても、カードの上の端は動かず、中だけが送れて「作成」のボタンは窓の中に残る", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const card = page.locator(".entry-card");
  const topBefore = (await card.boundingBox())!.y;
  await page.getByLabel("ほかのデバイスと同期する").check();
  await expect(page.getByText("同期先の種類")).toBeVisible();
  expect((await card.boundingBox())!.y).toBe(topBefore);
  // ページは送れず、カードの中が送れる。
  expect(await page.locator(".entry").evaluate((entry) => entry.scrollHeight <= entry.clientHeight)).toBe(true);
  expect(await card.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const submit = (await page.getByRole("button", { name: "作成" }).boundingBox())!;
  expect(submit.y + submit.height).toBeLessThanOrEqual(800);
});

test("ロックの画面では、「パスフレーズを忘れたとき」をボタンの上に置き、ボタンの行をカードの下の端に置く", async ({ page }) => {
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).waitFor();
  await page.keyboard.press("Control+l");
  await expect(page.getByRole("heading", { name: "ロックを解除" })).toBeVisible();
  const forgot = (await page.getByText("パスフレーズを忘れたとき").boundingBox())!;
  const unlock = (await page.getByRole("button", { name: "解除" }).boundingBox())!;
  expect(forgot.y).toBeLessThan(unlock.y);
  const card = (await page.locator(".entry-card").boundingBox())!;
  const actions = (await page.locator(".entry-card > .form-actions").boundingBox())!;
  expect(Math.round(actions.y + actions.height)).toBe(Math.round(card.y + card.height - 1));
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "解除" }).click();
  await expect(page.getByRole("button", { name: "新しいメモ" })).toBeVisible();
});

test("ロックの画面では、パスフレーズを打って Enter で解除でき、「このデバイスのデータを消す」は押されない", async ({ page }) => {
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).waitFor();
  await page.keyboard.press("Control+l");
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByLabel("パスフレーズ", { exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "新しいメモ" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

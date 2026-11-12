import { expect, type Page, test } from "@playwright/test";
import { openSettingsPage, PASSPHRASE, startLocalVault } from "./devices";

// 新しい vault を作り、設定の外観のページ（テーマとカスタム CSS）を開く。
async function openAppearanceOfNewVault(page: Page): Promise<void> {
  await startLocalVault(page);
  await openSettingsPage(page, "外観");
}

function cssVariable(page: Page, name: string): Promise<string> {
  return page.evaluate((variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(), name);
}

test("テーマを選ぶとすぐ色が変わり、開き直したロック解除の画面にも当たる", async ({ page }) => {
  await openAppearanceOfNewVault(page);
  expect(await cssVariable(page, "--panel")).toBe("#ffffff");
  await page.getByRole("radio", { name: "ミッドナイト" }).click();
  expect(await cssVariable(page, "--canvas")).toBe("#000000");
  await page.reload();
  await expect(page.getByRole("heading", { name: "ロックを解除" })).toBeVisible();
  expect(await cssVariable(page, "--canvas")).toBe("#000000");
});

test("システムに合わせるテーマは、OS がダークならダークの色になる", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openAppearanceOfNewVault(page);
  expect(await cssVariable(page, "--panel")).toBe("#1d2025");
});

test("自作のテーマは、読めない色の組み合わせでは保存できず、直すと保存して使える", async ({ page }) => {
  await openAppearanceOfNewVault(page);
  await page.getByRole("button", { name: "テーマを作る" }).click();
  await page.getByLabel("テーマの名前").fill("わたしの色");
  await page.getByLabel("文字", { exact: true }).fill("#f0f0f0");
  await expect(page.getByRole("alert").first()).toContainText("「文字」と「メモの地」の色が近く");
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
  // 設定の画面そのものは、保存するまで元の色のまま（読める）。
  expect(await cssVariable(page, "--text")).toBe("#1f2328");

  await page.getByLabel("文字", { exact: true }).fill("#102030");
  await page.getByLabel("アクセント", { exact: true }).fill("#8a2be2");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("radio", { name: "わたしの色" })).toHaveAttribute("aria-checked", "true");
  expect(await cssVariable(page, "--accent")).toBe("#8a2be2");

  await page.getByRole("button", { name: "削除" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "削除" }).click();
  await expect(page.getByRole("radio", { name: "わたしの色" })).toHaveCount(0);
  expect(await cssVariable(page, "--accent")).toBe("#2f6fde");
});

test("本文の文字の大きさを変えると、エディタの文字が大きくなる", async ({ page }) => {
  await startLocalVault(page);
  await openSettingsPage(page, "一般");
  await page.getByLabel("本文の文字の大きさ").selectOption("large");
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await expect(page.locator(".ProseMirror")).toHaveCSS("font-size", "16.5px");
});

test("カスタム CSS は、ロックを解除している間だけ当たり、ロック解除の画面でオフにできる", async ({ page }) => {
  await openAppearanceOfNewVault(page);
  await page.getByRole("textbox", { name: "カスタム CSS" }).fill(".settings-navigation h1 { letter-spacing: 7px; }");
  await page.getByRole("button", { name: "適用" }).click();
  const headingSpacing = () => page.getByRole("heading", { name: "設定", exact: true }).evaluate((heading) => getComputedStyle(heading).letterSpacing);
  await expect.poll(headingSpacing).toBe("7px");

  await page.reload();
  await expect(page.getByRole("heading", { name: "ロックを解除" })).toBeVisible();
  expect(await page.locator("#sedum-note-custom-css").count()).toBe(0);
  await page.getByLabel("カスタム CSS をオフにして開く").click();
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "解除" }).click();
  await openSettingsPage(page, "外観");
  await expect.poll(headingSpacing).not.toBe("7px");
  await expect(page.getByRole("checkbox", { name: "カスタム CSS を当てる" })).not.toBeChecked();
});

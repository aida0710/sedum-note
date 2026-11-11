import { expect, type Page, test } from "@playwright/test";

const PASSPHRASE = "correct horse battery";
// ひらがな・カタカナ・漢字。英語の画面に残っていたら、文言の拾い漏れ。
const JAPANESE_CHARACTERS = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

// 言語の選択肢の「日本語」は、どの言語の画面でも日本語で出すので除く。
async function visibleTextOutsideLanguageNames(page: Page): Promise<string> {
  return page.evaluate(() => {
    const body = document.body.cloneNode(true) as HTMLElement;
    body.querySelectorAll("#display-language").forEach((element) => element.remove());
    const attributes = [...document.querySelectorAll("[placeholder], [aria-label], [title]")]
      .flatMap((element) => ["placeholder", "aria-label", "title"].map((name) => element.getAttribute(name) ?? ""));
    return [body.innerText, ...attributes].join("\n");
  });
}

test.describe("システムの言語が英語のとき", () => {
  test.use({ locale: "en-US" });

  test("最初の画面・メモの画面・設定に日本語の文言が残らない", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Create" })).toBeVisible();
    expect(await visibleTextOutsideLanguageNames(page)).not.toMatch(JAPANESE_CHARACTERS);

    await page.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE);
    await page.getByLabel("Passphrase (confirm)").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByRole("button", { name: "New note" }).click();
    await page.getByPlaceholder("Title").fill("A note");
    await expect(page.getByText(/^Updated /)).toBeVisible();
    expect(await visibleTextOutsideLanguageNames(page)).not.toMatch(JAPANESE_CHARACTERS);

    await page.getByRole("button", { name: /Sync is not set up/ }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    expect(await visibleTextOutsideLanguageNames(page)).not.toMatch(JAPANESE_CHARACTERS);
  });

  test("設定で言語を日本語に変えると、開いたまま文言が入れ替わり、開き直しても保たれる", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE);
    await page.getByLabel("Passphrase (confirm)").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByRole("button", { name: /Sync is not set up/ }).click();
    await page.getByLabel("Language").selectOption("ja");
    await expect(page.getByRole("heading", { name: "設定" })).toBeVisible();
    await expect(page.getByRole("button", { name: "新しいメモ" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "ロックを解除" })).toBeVisible();
  });
});

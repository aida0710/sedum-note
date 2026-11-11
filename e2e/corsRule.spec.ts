import { expect, type Page, test } from "@playwright/test";
import { type CorsRule, newTestRemoteConfigWithCors } from "../integration/testStorage";
import type { RemoteConfig } from "../src/core/remote/remoteConfig";
import { corsRuleJson } from "../src/ui/settings/corsRule";

const PASSPHRASE = "correct horse battery";
// 画面の試験の開発サーバーの origin（playwright.config.ts の baseURL）。
const PAGE_ORIGIN = "http://127.0.0.1:5173";

async function startNewVault(page: Page, config: RemoteConfig): Promise<void> {
  await page.goto("/");
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
  await page.getByLabel("ほかのデバイスと同期する").check();
  await page.getByLabel("エンドポイント").fill(config.endpoint);
  await page.getByLabel("バケット").fill(config.bucket);
  await page.getByLabel("リージョン").fill(config.region);
  await page.getByLabel("フォルダ").fill(config.prefix);
  await page.getByLabel("アクセスキー ID").fill(config.accessKeyId);
  await page.getByLabel("シークレットアクセスキー").fill(config.secretAccessKey);
  await page.getByRole("button", { name: "作成" }).click();
}

test("設定の画面が案内する CORS の規則だけで、作成から同期まで通る", async ({ page }) => {
  const rules = JSON.parse(corsRuleJson(PAGE_ORIGIN)) as CorsRule[];
  const config = await newTestRemoteConfigWithCors("sedum-note-cors-documented", rules);
  await startNewVault(page, config);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill("CORS の確認");
  await expect(page.getByText(/同期済み/)).toBeVisible({ timeout: 20_000 });
});

test("CORS で ETag を公開していないと、ExposeHeaders に ETag を足すよう案内する", async ({ page }) => {
  const rules = (JSON.parse(corsRuleJson(PAGE_ORIGIN)) as CorsRule[]).map((rule) => ({ ...rule, ExposeHeaders: [] }));
  const config = await newTestRemoteConfigWithCors("sedum-note-cors-no-etag", rules);
  await startNewVault(page, config);
  await expect(page.getByRole("alert")).toContainText("ExposeHeaders に ETag を足してください");
});

test("CORS でこの画面の origin を許していないと、CORS の設定を確かめるよう案内する", async ({ page }) => {
  const rules = JSON.parse(corsRuleJson("https://other.example")) as CorsRule[];
  const config = await newTestRemoteConfigWithCors("sedum-note-cors-other-origin", rules.map((rule) => ({
    ...rule, AllowedOrigins: rule.AllowedOrigins.filter((origin) => origin !== PAGE_ORIGIN),
  })));
  await startNewVault(page, config);
  await expect(page.getByRole("alert")).toContainText("バケットに CORS の設定を入れてあるかを確かめてください");
});

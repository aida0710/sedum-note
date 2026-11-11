import { expect, type Page, test } from "@playwright/test";
import { type CorsRule, newTestRemoteConfigWithCors } from "../integration/testStorage";
import type { RemoteConfig } from "../src/core/remote/remoteConfig";
import { corsRuleJson } from "../src/ui/settings/corsRule";
import { fillSyncTarget, startSyncedVault } from "./devices";

// 画面の試験の開発サーバーの origin（playwright.config.ts の baseURL）。
const PAGE_ORIGIN = "http://127.0.0.1:5173";

// 同期先を入れて「接続を確認」を押す。CORS で断られると、ここで分かる。
async function checkSyncTarget(page: Page, config: RemoteConfig): Promise<void> {
  await page.goto("/");
  await fillSyncTarget(page, config);
  await page.getByRole("button", { name: "接続を確認" }).click();
}

test("設定の画面が案内する CORS の規則だけで、作成から同期まで通る", async ({ page }) => {
  const rules = JSON.parse(corsRuleJson(PAGE_ORIGIN)) as CorsRule[];
  const config = await newTestRemoteConfigWithCors("sedum-note-cors-documented", rules);
  await startSyncedVault(page, { remoteConfig: config, join: false });
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill("CORS の確認");
  await expect(page.getByText(/同期済み/)).toBeVisible({ timeout: 20_000 });
});

test("CORS で ETag を公開していないと、ExposeHeaders に ETag を足すよう案内する", async ({ page }) => {
  const rules = (JSON.parse(corsRuleJson(PAGE_ORIGIN)) as CorsRule[]).map((rule) => ({ ...rule, ExposeHeaders: [] }));
  const config = await newTestRemoteConfigWithCors("sedum-note-cors-no-etag", rules);
  // 空の同期先の確認は ETag を読まないので通る。書き込んで ETag を読むところで分かる。
  await startSyncedVault(page, { remoteConfig: config, join: false });
  await expect(page.getByRole("alert")).toContainText("ExposeHeaders に ETag を足してください");
});

test("CORS でこの画面の origin を許していないと、CORS の設定を確かめるよう案内する", async ({ page }) => {
  const rules = JSON.parse(corsRuleJson("https://other.example")) as CorsRule[];
  const config = await newTestRemoteConfigWithCors("sedum-note-cors-other-origin", rules.map((rule) => ({
    ...rule, AllowedOrigins: rule.AllowedOrigins.filter((origin) => origin !== PAGE_ORIGIN),
  })));
  await checkSyncTarget(page, config);
  await expect(page.getByRole("alert")).toContainText("バケットに CORS の設定を入れてあるかを確かめてください");
});

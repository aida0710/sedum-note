import { expect, type Page, test } from "@playwright/test";
import { type CorsRule, newTestRemoteConfigWithCors } from "../integration/testStorage";
import type { S3RemoteConfig } from "../src/core/remote/remoteConfig";
import { corsRuleJson } from "../src/ui/settings/corsRule";
import { fillSyncTarget, startSyncedVault } from "./devices";
import { PAGE_ORIGIN } from "./devServer";


// 同期先を入れて「接続を確認」を押す。CORS で断られると、ここで分かる。
async function checkSyncTarget(page: Page, config: S3RemoteConfig): Promise<void> {
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
  await expect(page.getByRole("alert")).toContainText("ExposeHeadersにETagを追加してください");
});

test("CORS でこの画面の origin を許していないと、CORS の設定を確かめるよう案内する", async ({ page }) => {
  const rules = JSON.parse(corsRuleJson("https://other.example")) as CorsRule[];
  const config = await newTestRemoteConfigWithCors("sedum-note-cors-other-origin", rules.map((rule) => ({
    ...rule, AllowedOrigins: rule.AllowedOrigins.filter((origin) => origin !== PAGE_ORIGIN),
  })));
  await checkSyncTarget(page, config);
  await expect(page.getByRole("alert")).toContainText("バケットに CORS の設定を入れてあるかを確かめてください");
});

test("同期先を保存したあとで同期が CORS で断られたときも、設定の同期のページで CORS の設定を開ける", async ({ page }) => {
  const config = await newTestRemoteConfigWithCors("sedum-note-cors-documented", JSON.parse(corsRuleJson(PAGE_ORIGIN)) as CorsRule[]);
  await startSyncedVault(page, { remoteConfig: config, join: false });
  await expect(page.getByText(/同期済み/)).toBeVisible({ timeout: 20_000 });
  // CORS で断られたときと同じく、ブラウザの fetch が失敗する形にする。
  await page.route((url) => url.origin === new URL(config.endpoint).origin, (route) => route.abort("failed"));
  await page.locator(".sync-line").click();
  await page.getByRole("button", { name: "今すぐ同期" }).click();
  await expect(page.getByRole("alert")).toContainText("バケットに CORS の設定を入れてあるかを確かめてください");
  await page.locator("summary", { hasText: "バケットの CORS の設定" }).click();
  await expect(page.getByRole("button", { name: "設定をコピー" })).toBeVisible();
});

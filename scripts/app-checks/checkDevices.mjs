// 確認の道具で共通に使う、試験用の同期先と、手元のブラウザ（PC の大きさ）の操作。

import { chromium } from "@playwright/test";
import { AwsClient } from "aws4fetch";

export const PASSPHRASE = "correct horse battery";

// integration/s3-up.sh の SeaweedFS。バケットは使い回し、確認ごとに prefix を分ける。
export async function newCheckRemoteConfig() {
  const remote = {
    endpoint: "http://127.0.0.1:18333", region: "us-east-1", bucket: "sedum-note-check",
    prefix: `check-${Date.now()}`, accessKeyId: "SEDUMNOTETESTKEY", secretAccessKey: "sedumnotetestsecret",
  };
  const s3 = new AwsClient({ accessKeyId: remote.accessKeyId, secretAccessKey: remote.secretAccessKey, service: "s3", region: remote.region, retries: 0 });
  const created = await s3.fetch(`${remote.endpoint}/${remote.bucket}`, { method: "PUT" });
  if (!created.ok && created.status !== 409) {
    throw new Error(`could not create the check bucket: ${created.status}`);
  }
  return remote;
}

// 入力欄のラベルと同期先の項目の対応。Playwright の getByLabel と WebDriver の両方で使う。
export const REMOTE_FIELDS = [
  ["エンドポイント", "remote-endpoint", "endpoint"],
  ["バケット", "remote-bucket", "bucket"],
  ["リージョン", "remote-region", "region"],
  ["フォルダ", "remote-prefix", "prefix"],
  ["アクセスキー ID", "remote-access-key", "accessKeyId"],
  ["シークレットアクセスキー", "remote-secret-key", "secretAccessKey"],
];

// 手元のブラウザで vault を作り、メモを 1 件書いて送る。vite の開発サーバー（5173）を使う。
export async function startBrowserDevice(remote) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage();
  await page.goto("http://127.0.0.1:5173/");
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
  await page.getByLabel("ほかのデバイスと同期する").check();
  for (const [label, , field] of REMOTE_FIELDS) {
    await page.getByLabel(label).fill(remote[field]);
  }
  await page.getByRole("button", { name: "作成" }).click();
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill("PCで書いたメモ");
  await page.getByPlaceholder("タイトル").press("Enter");
  await page.keyboard.type("アプリで読めるか確かめる #確認");
  // 編集の 2 秒後に送るので、それより長く待つ。
  await page.waitForTimeout(4_000);
  return { browser, page };
}

// ロックを解除し直して、アプリで書いたメモが届いたかを見る。
export async function expectNoteFromApp(page, outputPath) {
  await page.reload();
  await page.getByLabel("パスフレーズ").fill(PASSPHRASE);
  await page.getByRole("button", { name: "解除" }).click();
  await page.getByRole("button", { name: /アプリで書いたメモ/ }).first().waitFor({ timeout: 30_000 });
  await page.screenshot({ path: outputPath });
}

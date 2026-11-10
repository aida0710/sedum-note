import { type Browser, expect, type Page, test } from "@playwright/test";
import { newTestBucket } from "../integration/testStorage";
import { S3ObjectStore } from "../src/core/remote/s3ObjectStore";
import type { RemoteConfig } from "../src/core/remote/remoteConfig";

const PASSPHRASE = "correct horse battery";
// 画面の確認用の画像を置く場所。artifacts は git に入れない。
const SCREENSHOT_DIRECTORY = process.env.SCREENSHOT_DIRECTORY;

async function fillRemoteConfig(page: Page, config: RemoteConfig): Promise<void> {
  await page.getByLabel("エンドポイント").fill(config.endpoint);
  await page.getByLabel("バケット").fill(config.bucket);
  await page.getByLabel("リージョン").fill(config.region);
  await page.getByLabel("フォルダ").fill(config.prefix);
  await page.getByLabel("アクセスキー ID").fill(config.accessKeyId);
  await page.getByLabel("シークレットアクセスキー").fill(config.secretAccessKey);
}

async function newDevice(browser: Browser, viewport: { width: number; height: number }): Promise<Page> {
  const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
  return context.newPage();
}

async function photoPng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d")!;
    const sky = context.createLinearGradient(0, 0, 0, 200);
    sky.addColorStop(0, "#3d7fd6");
    sky.addColorStop(1, "#8fcaf3");
    context.fillStyle = sky;
    context.fillRect(0, 0, 640, 200);
    context.fillStyle = "#e9dcae";
    context.fillRect(0, 200, 640, 160);
    return canvas.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

async function capture(page: Page, name: string): Promise<void> {
  if (SCREENSHOT_DIRECTORY) {
    await page.screenshot({ path: `${SCREENSHOT_DIRECTORY}/${name}.png` });
  }
}

test("PC で書いた写真付きのメモが、スマホの大きさのもう 1 台に同期される", async ({ browser }) => {
  const remoteConfig = await newTestBucket();

  const laptop = await newDevice(browser, { width: 1280, height: 820 });
  await laptop.goto("/");
  await laptop.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await laptop.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
  await fillRemoteConfig(laptop, remoteConfig);
  await laptop.getByRole("button", { name: "作成" }).click();

  await laptop.getByRole("button", { name: "ノートブックを追加" }).click();
  await laptop.getByPlaceholder("ノートブックの名前").fill("旅行");
  await laptop.getByPlaceholder("ノートブックの名前").press("Enter");
  await laptop.getByRole("button", { name: /^旅行/ }).click();
  await laptop.getByRole("button", { name: "新しいメモ" }).click();

  await laptop.getByPlaceholder("タイトル").fill("沖縄旅行の持ち物");
  await laptop.getByPlaceholder("タイトル").press("Enter");
  await laptop.keyboard.type("パスポートは不要。2日目にシュノーケル。 #todo #沖縄");
  await laptop.keyboard.press("Enter");
  await laptop.locator('input[type="file"]').first().setInputFiles({ name: "beach.png", mimeType: "image/png", buffer: await photoPng(laptop) });
  await expect(laptop.locator(".attachment-image img")).toBeVisible();
  await laptop.getByRole("button", { name: "チェックリスト" }).click();
  await laptop.keyboard.type("日焼け止め");
  await laptop.keyboard.press("Enter");
  await laptop.keyboard.type("モバイルバッテリー");

  await expect(laptop.locator(".document-meta")).toContainText("#todo");
  // PC が最後の編集まで送り終えてから、もう 1 台を参加させる（編集のあと 2 秒待って送る）。
  const bucket = new S3ObjectStore(remoteConfig);
  await expect.poll(async () => (await bucket.list("records/")).length, { timeout: 20_000 }).toBe(2);
  await expect.poll(async () => (await bucket.list("blobs/")).length).toBe(1);
  await expect(laptop.getByText(/同期済み/)).toBeVisible({ timeout: 20_000 });
  await laptop.waitForTimeout(3_000);
  await expect(laptop.getByText(/同期済み/)).toBeVisible({ timeout: 20_000 });
  await capture(laptop, "desktop-editor");

  const phone = await newDevice(browser, { width: 390, height: 844 });
  await phone.goto("/");
  await capture(phone, "mobile-setup");
  await expect.poll(() => phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await phone.getByRole("tab", { name: "既存のメモに参加" }).click();
  await phone.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await fillRemoteConfig(phone, remoteConfig);
  await phone.getByRole("button", { name: "参加" }).click();

  await expect(phone.getByRole("button", { name: /沖縄旅行の持ち物/ })).toBeVisible({ timeout: 20_000 });
  await expect(phone.locator(".note-item .thumb")).toBeVisible();
  await capture(phone, "mobile-list");
  await phone.getByRole("button", { name: /沖縄旅行の持ち物/ }).click();
  await expect(phone.locator(".attachment-image img")).toBeVisible();
  await expect(phone.locator(".ProseMirror")).toContainText("モバイルバッテリー");
  await expect(phone.locator('.ProseMirror ul[data-type="taskList"] input[type="checkbox"]')).toHaveCount(2);
  await expect(phone.locator(".title-input")).toHaveValue("沖縄旅行の持ち物");
  await capture(phone, "mobile-editor");
});

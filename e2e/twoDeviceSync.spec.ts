import { type Browser, expect, type Page, test } from "@playwright/test";
import { newTestRemoteConfig } from "../integration/testStorage";
import { S3ObjectStore } from "../src/core/remote/s3ObjectStore";
import { createNoteOnDesktop, DESKTOP_VIEWPORT, openSyncedDevice, startSyncedVault, syncNowOnDesktop } from "./devices";

const PASSPHRASE = "correct horse battery";
// 画面の確認用の画像を置く場所。artifacts は git に入れない。
const SCREENSHOT_DIRECTORY = process.env.SCREENSHOT_DIRECTORY;

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
  const remoteConfig = await newTestRemoteConfig();

  const laptop = await newDevice(browser, { width: 1280, height: 820 });
  await startSyncedVault(laptop, { remoteConfig, join: false });

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
  await startSyncedVault(phone, { remoteConfig, join: true });

  await expect(phone.getByRole("button", { name: /沖縄旅行の持ち物/ })).toBeVisible({ timeout: 20_000 });
  await expect(phone.locator(".note-item .thumb")).toBeVisible();
  await capture(phone, "mobile-list");
  await phone.getByRole("button", { name: /沖縄旅行の持ち物/ }).click();
  await expect(phone.locator(".attachment-image img")).toBeVisible();
  await expect(phone.locator(".ProseMirror")).toContainText("モバイルバッテリー");
  await expect(phone.locator('.ProseMirror ul[data-type="taskList"] input[type="checkbox"]')).toHaveCount(2);
  await expect(phone.locator(".title-input")).toHaveValue("沖縄旅行の持ち物");
  // 端末の「戻る」で一覧に戻る（アプリを閉じない）。
  await phone.goBack();
  await expect(phone.getByRole("heading", { name: "すべてのメモ" })).toBeVisible();
  await capture(phone, "mobile-editor");
});

test("写真は貼り付けとドロップでも本文に入る", async ({ browser }) => {
  const page = await newDevice(browser, { width: 1280, height: 820 });
  await page.goto("/");
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
  await page.getByRole("button", { name: "作成" }).click();
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.locator(".ProseMirror").click();
  const png = [...(await photoPng(page))];
  // 貼り付けとドロップの事象を、画像のファイルを持たせて本文に送る（OS のクリップボードとドラッグの代わり）。
  for (const eventName of ["paste", "drop"]) {
    await page.locator(".ProseMirror").evaluate((editor, { bytes, name }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], `${name}.png`, { type: "image/png" }));
      const box = editor.getBoundingClientRect();
      const event = name === "paste"
        ? new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true })
        : new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true, clientX: box.left + 10, clientY: box.top + 10 });
      editor.dispatchEvent(event);
    }, { bytes: png, name: eventName });
  }
  await expect(page.locator(".attachment-image img")).toHaveCount(2);
  await expect(page.locator(".attachment-image .file-name")).toHaveText(["paste.png", "drop.png"]);
});

test("1 台で残した履歴を、もう 1 台の履歴のダイアログで見られ、そこからそのメモを戻せる。戻した中身は、もう 1 台にも届く", async ({ browser }) => {
  const remoteConfig = await newTestRemoteConfig();
  const laptop = await newDevice(browser, DESKTOP_VIEWPORT);
  // 履歴は 10 分おきに残るので、書いた側の時計を進める。
  await laptop.clock.install({ time: new Date() });
  await startSyncedVault(laptop, { remoteConfig, join: false });
  await createNoteOnDesktop(laptop, "議事録");
  await laptop.keyboard.type("書き直す前の文");
  await laptop.clock.runFor(11 * 60_000);
  await laptop.locator(".ProseMirror").click();
  await laptop.keyboard.press("Control+A");
  await laptop.keyboard.type("書き直した文");
  await laptop.clock.runFor(1_000);
  await syncNowOnDesktop(laptop, "議事録");

  const desktop = await openSyncedDevice(browser, { remoteConfig, join: true });
  await desktop.locator(".tree-note", { hasText: "議事録" }).first().click();
  await expect(desktop.locator(".ProseMirror")).toHaveText("書き直した文");
  await desktop.getByRole("button", { name: "その他の操作" }).last().click();
  await desktop.getByRole("menuitem", { name: "履歴" }).click();
  const history = desktop.getByRole("dialog", { name: "履歴" });
  await expect(history.getByRole("option")).toHaveCount(1);
  await expect(history.locator(".note-history-preview")).toContainText("書き直す前の文");
  await history.getByRole("button", { name: "このバージョンに戻す" }).click();
  await expect(desktop.locator(".ProseMirror")).toHaveText("書き直す前の文");
  await expect(desktop.locator(".tree-note", { hasText: "議事録" })).toHaveCount(1);

  // 戻した中身は、新しい編集として同期され、書いた側でも開いたままのエディタに出る。
  await syncNowOnDesktop(desktop, "議事録");
  await syncNowOnDesktop(laptop, "議事録");
  await expect(laptop.locator(".ProseMirror")).toHaveText("書き直す前の文");
});

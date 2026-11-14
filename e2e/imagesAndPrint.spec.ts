import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, insertFromSlashMenu, openSettingsPage, startLocalVault } from "./devices";

// 写真の代わりの、細かいむらのある大きな画像を作る。
async function largePhoto(page: Page, width: number, height: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(({ width: canvasWidth, height: canvasHeight }) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext("2d")!;
    // 色の帯の上に細かいむらを載せる（べた塗りだと、縮めてもファイルが小さくならない）。
    const pixels = context.createImageData(canvasWidth, canvasHeight);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const pixel = index / 4;
      const shade = ((pixel % canvasWidth) / canvasWidth) * 200 + Math.random() * 55;
      pixels.data[index] = shade;
      pixels.data[index + 1] = 255 - shade;
      pixels.data[index + 2] = (Math.floor(pixel / canvasWidth) / canvasHeight) * 255;
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.95);
  }, { width, height });
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

async function openNewNote(page: Page): Promise<void> {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "写真のメモ");
}

const attachedImageWidth = (page: Page) => page.locator(".attachment-image img").evaluate((image: HTMLImageElement) => image.naturalWidth);

test("写真は既定では元のまま貼り、「小さくして貼る」にすると長い辺を 2048px まで縮める", async ({ page }) => {
  await openNewNote(page);
  const photo = await largePhoto(page, 4000, 3000);
  await page.locator('input[type="file"][accept="image/*"]:not([capture])').setInputFiles({ name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.locator(".attachment-image img")).toBeVisible();
  expect(await attachedImageWidth(page)).toBe(4000);

  await openSettingsPage(page, "一般");
  await page.getByLabel("写真を貼るとき").selectOption("reduced");
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill("小さくした写真");
  await page.getByPlaceholder("タイトル").press("Enter");
  await page.locator('input[type="file"][accept="image/*"]:not([capture])').setInputFiles({ name: "IMG_0002.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.locator(".attachment-image img")).toBeVisible();
  expect(await attachedImageWidth(page)).toBe(2048);
  await expect(page.locator(".attachment-image")).toContainText("IMG_0002.jpg");
});

test("「貼るたびに聞く」では、小さくするか元のままかを選べる。もう小さい写真は縮めない", async ({ page }) => {
  await openNewNote(page);
  await openSettingsPage(page, "一般");
  await page.getByLabel("写真を貼るとき").selectOption("ask");
  await page.getByRole("tab", { name: "写真のメモ" }).click();

  await page.locator('input[type="file"][accept="image/*"]:not([capture])').setInputFiles({ name: "big.jpg", mimeType: "image/jpeg", buffer: await largePhoto(page, 3000, 2000) });
  const question = page.getByRole("dialog");
  await expect(question).toContainText("写真を小さくして貼りますか");
  await question.getByRole("button", { name: "元のまま" }).click();
  await expect(page.locator(".attachment-image img")).toBeVisible();
  expect(await attachedImageWidth(page)).toBe(3000);

  await page.locator('input[type="file"][accept="image/*"]:not([capture])').setInputFiles({ name: "small.jpg", mimeType: "image/jpeg", buffer: await largePhoto(page, 800, 600) });
  await page.getByRole("dialog").getByRole("button", { name: "小さくする" }).click();
  await expect(page.locator(".attachment-image img")).toHaveCount(2);
  expect(await page.locator(".attachment-image img").last().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(800);
});

test("印刷では、開いているメモの本文だけを、明るい色で出す", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("印刷する本文");
  await openSettingsPage(page, "外観");
  await page.getByRole("radio", { name: "ミッドナイト" }).click();
  await page.getByRole("tab", { name: "写真のメモ" }).click();

  await page.evaluate(() => { window.print = () => { (window as unknown as { printed: boolean }).printed = true; }; });
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "印刷・PDF で保存" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed?: boolean }).printed)).toBe(true);

  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".editor-bar")).toBeHidden();
  await expect(page.locator(".ProseMirror")).toBeVisible();
  // 暗いテーマのままでも、紙には黒い文字で出る。
  await expect(page.locator(".ProseMirror")).toHaveCSS("color", "rgb(31, 35, 40)");
});

test("印刷では、段組みも紙の幅からはみ出さない", async ({ page }) => {
  await openNewNote(page);
  await insertFromSlashMenu(page, "dangumi", "2 段組み");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".ProseMirror .columns")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("まだ届いていない写真と音声は、届いていないことと「再読み込み」を出す", async ({ page }) => {
  await openNewNote(page);
  const missingId = "f".repeat(32);
  await page.evaluate((attachmentId) => {
    const body = document.querySelector(".ProseMirror") as HTMLElement & { editor: { commands: { insertContent: (content: unknown) => boolean } } };
    body.editor.commands.insertContent([
      { type: "attachmentImage", attrs: { attachmentId, fileName: "届いていない.png", mimeType: "image/png" } },
      { type: "attachmentFile", attrs: { attachmentId, fileName: "届いていない.m4a", mimeType: "audio/mp4", byteLength: 1000 } },
    ]);
  }, missingId);
  const image = page.locator(".attachment-image");
  await expect(image.getByRole("status")).toContainText("まだこのデバイスに届いていません");
  await expect(image.getByRole("button", { name: "再読み込み" })).toBeVisible();
  await image.getByRole("button", { name: "再読み込み" }).click();
  await expect(image.getByRole("status")).toContainText("まだこのデバイスに届いていません");

  await page.getByRole("button", { name: "届いていない.m4a を再生" }).click();
  const audio = page.locator(".attachment-file");
  await expect(audio.getByRole("status")).toContainText("まだこのデバイスに届いていません");
  await expect(audio.getByRole("button", { name: "再読み込み" })).toBeVisible();
});

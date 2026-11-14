import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, startLocalVault } from "./devices";

const SCREENSHOT_DIRECTORY = process.env.SCREENSHOT_DIRECTORY;
const PHOTO_SIZE = { width: 400, height: 300 };
// 写真の中の書類（白い四角形）の四隅。左上、右上、右下、左下。斜めから撮った形にする。
const DOCUMENT_CORNERS: Array<[number, number]> = [[60, 40], [340, 70], [310, 260], [40, 230]];

// 暗い机の上に、白い書類が斜めに写っている写真を作る。
async function photoOfDocument(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(({ size, corners }) => {
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#203040";
    context.fillRect(0, 0, size.width, size.height);
    context.fillStyle = "#ffffff";
    context.beginPath();
    corners.forEach(([x, y], index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
    context.closePath();
    context.fill();
    return canvas.toDataURL("image/png");
  }, { size: PHOTO_SIZE, corners: DOCUMENT_CORNERS });
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

// 「/」から書類のスキャンを選び、開いたファイルの選択で、書類の写真を渡す。
async function pickPhotoToScan(page: Page): Promise<void> {
  // ファイルの選択を受け取る準備は、先に済ませる（Enter の直前に始めると、準備が効く前に選択の画面が開いて、受け取れないことがある）。
  const fileChooser = page.waitForEvent("filechooser");
  await page.keyboard.type("/すきゃん");
  // 候補が出る前に Enter を送ると、改行になる。
  await expect(page.getByRole("option", { name: "書類のスキャン" })).toBeVisible();
  await page.keyboard.press("Enter");
  await (await fileChooser).setFiles({ name: "desk.png", mimeType: "image/png", buffer: await photoOfDocument(page) });
}

test("書類のスキャンは、写真の上で四隅を合わせると、傾きを直した画像にして貼る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "領収書");
  await pickPhotoToScan(page);

  const dialog = page.getByRole("dialog", { name: "書類のスキャン" });
  const corners = dialog.getByRole("slider");
  await expect(corners).toHaveCount(4);
  // 四隅の印を、書類の四隅まで引く。印を少し内側に置いて、机の色が入らないようにする。
  const photoBox = (await dialog.locator("canvas").boundingBox())!;
  const center = [0, 1].map((axis) => DOCUMENT_CORNERS.reduce((sum, corner) => sum + corner[axis]!, 0) / DOCUMENT_CORNERS.length);
  for (const [index, [x, y]] of DOCUMENT_CORNERS.entries()) {
    const insideX = x + Math.sign(center[0]! - x) * 6;
    const insideY = y + Math.sign(center[1]! - y) * 6;
    const handleBox = (await corners.nth(index).boundingBox())!;
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(photoBox.x + (insideX / PHOTO_SIZE.width) * photoBox.width, photoBox.y + (insideY / PHOTO_SIZE.height) * photoBox.height, { steps: 5 });
    await page.mouse.up();
  }
  if (SCREENSHOT_DIRECTORY) {
    await page.screenshot({ path: `${SCREENSHOT_DIRECTORY}/scan-corners.png` });
  }
  await dialog.getByRole("button", { name: "補正して挿入" }).click();
  await expect(dialog).toHaveCount(0);

  // 貼った画像は、四隅まで書類の白になっている（机の色が残っていない）。
  const image = page.locator(".ProseMirror .attachment-image img");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("alt", /^スキャン \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.jpg$/);
  const cornerColors = await image.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    const canvas = document.createElement("canvas");
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(element, 0, 0);
    const brightnessAt = (x: number, y: number) => context.getImageData(x, y, 1, 1).data[0]!;
    const right = canvas.width - 3;
    const bottom = canvas.height - 3;
    return { width: canvas.width, height: canvas.height, brightness: [brightnessAt(2, 2), brightnessAt(right, 2), brightnessAt(right, bottom), brightnessAt(2, bottom)] };
  });
  expect(Math.min(...cornerColors.brightness)).toBeGreaterThan(230);
  // 大きさは、書類の辺の長さ（約 270 × 190）に近い。
  expect(cornerColors.width).toBeGreaterThan(240);
  expect(cornerColors.width).toBeLessThan(300);
  expect(cornerColors.height).toBeGreaterThan(160);
  expect(cornerColors.height).toBeLessThan(220);
  if (SCREENSHOT_DIRECTORY) {
    await page.screenshot({ path: `${SCREENSHOT_DIRECTORY}/scan-attached.png` });
  }
});

test("書類のスキャンをやめると、何も貼らない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "領収書");
  await pickPhotoToScan(page);
  const dialog = page.getByRole("dialog", { name: "書類のスキャン" });
  await dialog.getByRole("button", { name: "キャンセル" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".ProseMirror .attachment-image")).toHaveCount(0);
});

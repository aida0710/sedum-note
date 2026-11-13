import { expect, type Locator, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, insertBodyHtml, startLocalVault } from "./devices";

const BODY_HTML = "<h2>見出し</h2><p>見出しの下の段落</p><ul><li><p>親の項目</p><ul><li><p>子の項目</p></li></ul></li></ul><p>末尾の段落</p>";

const isShown = (mark: Locator) => mark.evaluate((element) => getComputedStyle(element).opacity === "1");

// from から to まで、マウスを steps 回に分けてまっすぐ動かし、その間ずっと mark が見えていたかを返す。
async function staysShownWhileMoving(page: Page, mark: Locator, from: { x: number; y: number }, to: { x: number; y: number }): Promise<boolean> {
  const steps = Math.ceil(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)));
  for (let step = 0; step <= steps; step += 1) {
    await page.mouse.move(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps);
    if (!(await isShown(mark))) {
      return false;
    }
  }
  return true;
}

const centerOf = async (element: Locator) => {
  const box = (await element.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test("見出しの文字から左へマウスを運ぶ間、ズームのボタンと折りたたみの印が消えず、押せる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "印の試し");
  await insertBodyHtml(page, BODY_HTML);
  const heading = page.locator(".ProseMirror h2");
  const zoomButton = heading.getByRole("button", { name: "このセクションにズーム" });
  const foldToggle = heading.locator(".fold-toggle");
  const headingBox = (await heading.boundingBox())!;
  const start = { x: headingBox.x + 30, y: headingBox.y + headingBox.height / 2 };
  await page.mouse.move(start.x, start.y);
  await expect(zoomButton).toHaveCSS("opacity", "1");
  const zoomCenter = await centerOf(zoomButton);
  // 文字の上から、1px ずつ左へ。印と印の隙間や、見出しの要素の外を通る。
  expect(await staysShownWhileMoving(page, zoomButton, start, zoomCenter)).toBe(true);
  expect(await isShown(foldToggle)).toBe(true);
  await page.mouse.click(zoomCenter.x, zoomCenter.y);
  await expect(page.getByRole("button", { name: /^「.*」に戻る$/ })).toBeVisible();
});

test("箇条書きの折りたたみの印は、下の段落から斜めに近づく間も、行頭の印の上を通る間も消えない。マウスが本文の列を出ると消える", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "印の試し");
  await insertBodyHtml(page, BODY_HTML);
  const parentItem = page.locator(".ProseMirror > ul > li");
  const foldToggle = parentItem.locator("> .fold-toggle");
  const parentLine = (await parentItem.locator("> p").boundingBox())!;
  const toggleCenter = await centerOf(foldToggle);
  // 親の項目の行の文字の上から、行頭の印の上を通って、折りたたみの印まで。
  const onText = { x: parentLine.x + 40, y: parentLine.y + parentLine.height / 2 };
  await page.mouse.move(onText.x, onText.y);
  await expect(foldToggle).toHaveCSS("opacity", "1");
  expect(await staysShownWhileMoving(page, foldToggle, onText, toggleCenter)).toBe(true);

  // 親の項目の行の右のほうから、斜めに。行の高さの中にいる間は、ずっと見えている。
  const farRight = { x: parentLine.x + 300, y: parentLine.y + parentLine.height - 2 };
  await page.mouse.move(farRight.x, farRight.y);
  expect(await staysShownWhileMoving(page, foldToggle, farRight, { x: toggleCenter.x, y: parentLine.y + 2 })).toBe(true);

  await page.mouse.click(toggleCenter.x, toggleCenter.y);
  await expect(page.locator(".ProseMirror p", { hasText: "子の項目" })).toBeHidden();

  // 開き直してから、マウスを本文の列の外（左の列）へ出すと、開いている項目の印は消える。
  await page.mouse.click(toggleCenter.x, toggleCenter.y);
  await expect(page.locator(".ProseMirror p", { hasText: "子の項目" })).toBeVisible();
  await page.mouse.move(20, 300);
  await expect(parentItem.locator("> .fold-toggle")).toHaveCSS("opacity", "0");
});

test("折りたたみの印は文字ではなくアイコンで、たたんだ所では右向き、開いている所では下向きになる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "印の試し");
  await insertBodyHtml(page, BODY_HTML);
  const foldToggle = page.locator(".ProseMirror h2 .fold-toggle");
  await expect(foldToggle.locator("svg")).toHaveCount(1);
  const rotationOf = () => foldToggle.locator("svg").evaluate((icon) => getComputedStyle(icon).transform);
  // 開いているときは 90 度回した行列。
  expect(await rotationOf()).toBe("matrix(0, 1, -1, 0, 0, 0)");
  await page.locator(".ProseMirror h2").hover();
  await foldToggle.click();
  await expect(page.locator(".ProseMirror p", { hasText: "見出しの下の段落" })).toBeHidden();
  expect(await rotationOf()).toBe("none");
  // たたんだ所の印は、マウスが離れても出たまま。
  await page.mouse.move(20, 300);
  await expect(foldToggle).toHaveCSS("opacity", "1");
});

import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, startLocalVault } from "./devices";

const SCREENSHOT_DIRECTORY = process.env.SCREENSHOT_DIRECTORY;
const canvas = (page: Page) => page.locator(".drawing-canvas");
// 枠に描いてある線（描いている途中の線は含まない）。
const strokes = (page: Page) => canvas(page).locator("g.drawing-stroke");

// 枠の中を、割合（0〜1）で指した点から点へ、押したままなぞる。
async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * ((from[0] + to[0]) / 2), box.y + box.height * ((from[1] + to[1]) / 2), { steps: 4 });
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 4 });
  await page.mouse.up();
}

test("手書きの枠に、ペンの線と図形を描ける。消しゴムで 1 本ずつ消せ、開き直しても残っていて描き足せる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "スケッチ");
  await page.keyboard.type("/てがき");
  await page.keyboard.press("Enter");
  await expect(canvas(page)).toBeVisible();

  await drag(page, [0.1, 0.2], [0.4, 0.6]);
  await expect(strokes(page)).toHaveCount(1);
  await page.getByRole("button", { name: "四角" }).click();
  await page.getByRole("button", { name: "赤" }).click();
  await drag(page, [0.5, 0.2], [0.8, 0.7]);
  await page.getByRole("button", { name: "円", exact: true }).click();
  await drag(page, [0.2, 0.65], [0.4, 0.9]);
  await expect(strokes(page)).toHaveCount(3);
  await expect(canvas(page)).toHaveAccessibleName("手書きの枠（線 3 本）");
  if (SCREENSHOT_DIRECTORY) {
    await page.screenshot({ path: `${SCREENSHOT_DIRECTORY}/drawing.png` });
  }

  // 押しただけで動かさないと、線にならない。
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.9);
  await expect(strokes(page)).toHaveCount(3);

  // 消しゴムで、四角の辺を押すと、四角だけが消える。
  await page.getByRole("button", { name: /消しゴム/ }).click();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await expect(strokes(page)).toHaveCount(2);

  // 開き直しても残っていて、描き足せる。
  await createNoteOnDesktop(page, "別のメモ");
  await page.getByRole("tab", { name: "スケッチ" }).click();
  await expect(strokes(page)).toHaveCount(2);
  await drag(page, [0.6, 0.3], [0.9, 0.4]);
  await expect(strokes(page)).toHaveCount(3);
});

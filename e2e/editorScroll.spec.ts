import { expect, test } from "@playwright/test";
import { caretAndBodyFrame, createNoteOnDesktop, insertBodyHtml, PHONE_VIEWPORT, startLocalVault } from "./devices";

const LONG_BODY_HTML = Array.from({ length: 60 }, (_unused, index) => `<p>段落 ${index + 1}</p>`).join("");
// 打っている行の下に残す余白（px）の下限。editor/bodyScroll.ts の CARET_SCROLL_MARGIN の下の値（PC 160、スマホ 80）より少し小さく見る。
const SPACE_BELOW_CARET = { desktop: 150, phone: 70 };

test("長いメモの末尾で打ち続けても、打っている行が窓の下の端に付かず、下に余白が残る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "長いメモ");
  await insertBodyHtml(page, LONG_BODY_HTML);
  for (let line = 0; line < 5; line += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.type("続き");
  }
  const { caret, frame } = await caretAndBodyFrame(page);
  expect(frame.bottom - caret.bottom).toBeGreaterThanOrEqual(SPACE_BELOW_CARET.desktop);
  expect(caret.top).toBeGreaterThan(frame.top);
});

test("スマホでも、長いメモの末尾で打つ行の下に余白が残り、打つたびに行が上下に動かない", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(page);
  await page.locator(".fab").click();
  await page.getByPlaceholder("タイトル").fill("長いメモ");
  await page.getByPlaceholder("タイトル").press("Enter");
  await insertBodyHtml(page, LONG_BODY_HTML);
  await page.keyboard.press("Enter");
  await page.keyboard.type("続き");
  const first = await caretAndBodyFrame(page);
  expect(first.frame.bottom - first.caret.bottom).toBeGreaterThanOrEqual(SPACE_BELOW_CARET.phone);
  // 同じ行に打ち足しても、行の高さは変わらない。
  await page.keyboard.type("の文字");
  const second = await caretAndBodyFrame(page);
  expect(second.caret.top).toBe(first.caret.top);
});

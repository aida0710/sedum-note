import { type Browser, expect, type Page, test } from "@playwright/test";
import { PHONE_VIEWPORT, startLocalVault } from "./devices";

// スマホの幅の画面で、同期なしの vault を作る。hasTouch を付けると、指で使う端末（pointer: coarse）として開く。
async function openPhone(browser: Browser, { hasTouch = false }: { hasTouch?: boolean } = {}): Promise<Page> {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT, hasTouch })).newPage();
  await startLocalVault(page);
  return page;
}

// スマホの一覧で新しいメモを作り、題を入れる（メモは開いたまま）。
async function openNewNoteOnPhone(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill(title);
}

test("スマホの下のツールバーで、打った文字を元に戻してやり直せる", async ({ browser }) => {
  const page = await openPhone(browser);
  await openNewNoteOnPhone(page, "取り消し");
  const body = page.locator(".ProseMirror");
  const toolbar = page.locator(".editor-bar");
  const undo = toolbar.getByRole("button", { name: "元に戻す" });
  const redo = toolbar.getByRole("button", { name: "やり直す" });
  await expect(undo).toHaveAttribute("aria-disabled", "true");

  await body.click();
  await page.keyboard.type("牛乳を買う");
  await expect(undo).not.toHaveAttribute("aria-disabled", "true");
  await undo.click();
  await expect(body).not.toContainText("牛乳を買う");
  // 押したあとも、本文にカーソルが残る（キーボードが閉じない）。
  await expect(body).toBeFocused();
  await redo.click();
  await expect(body).toContainText("牛乳を買う");
});

test("スマホの下のツールバーで、箇条書きの項目を字下げして戻し、上下に動かせる", async ({ browser }) => {
  const page = await openPhone(browser);
  await openNewNoteOnPhone(page, "字下げ");
  const body = page.locator(".ProseMirror");
  const toolbar = page.locator(".editor-bar");
  const indent = toolbar.getByRole("button", { name: "字下げ", exact: true });
  const outdent = toolbar.getByRole("button", { name: "字下げを戻す" });
  // 箇条書きの外では、字下げのボタンは出さない。
  await body.click();
  await expect(indent).toHaveCount(0);

  await toolbar.getByRole("button", { name: "箇条書き", exact: true }).click();
  await page.keyboard.type("親");
  await page.keyboard.press("Enter");
  await page.keyboard.type("子");
  // 最初の項目は深くできないが、2 つ目は前の項目の中へ入れられる。
  await indent.click();
  await expect(body.locator("ul ul li")).toHaveText("子");
  await expect(body).toBeFocused();
  await outdent.click();
  await expect(body.locator("ul ul")).toHaveCount(0);

  await toolbar.getByRole("button", { name: "ブロックを上へ動かす" }).click();
  await expect(body.locator("ul > li")).toHaveText(["子", "親"]);
  await toolbar.getByRole("button", { name: "ブロックを下へ動かす" }).click();
  await expect(body.locator("ul > li")).toHaveText(["親", "子"]);
});

test("スマホの下のツールバーは、画面に入り切らないとき、続きのある側の端をぼかす", async ({ browser }) => {
  const page = await openPhone(browser);
  await openNewNoteOnPhone(page, "ツールバー");
  const toolbar = page.locator(".editor-bar");
  await expect(toolbar).toHaveAttribute("data-more-end", "");
  await expect(toolbar).not.toHaveAttribute("data-more-start", "");
  expect(await toolbar.evaluate((element) => getComputedStyle(element).maskImage)).toContain("linear-gradient");

  await toolbar.evaluate((element) => element.scrollTo({ left: element.scrollWidth }));
  await expect(toolbar).toHaveAttribute("data-more-start", "");
  await expect(toolbar).not.toHaveAttribute("data-more-end", "");
});

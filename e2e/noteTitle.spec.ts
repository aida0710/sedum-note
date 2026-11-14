import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, insertFromSlashMenu, PASSPHRASE, PHONE_VIEWPORT, placeCursorInBlock, startLocalVault, textOfBlockAtCursor } from "./devices";

const LONG_TITLE = "来年度の研究計画と予算の見直しについて、関係する全部の部署の担当者と相談して決めたことのまとめ（第 3 版・最終確認用）";

const titleInput = (page: Page) => page.getByPlaceholder("タイトル");
const cursorOffsetInTitle = (page: Page) => titleInput(page).evaluate((input: HTMLTextAreaElement) => input.selectionStart);

// 記録に保存された題（左の列のメモの行に出る）。
const savedTitleInSidebar = (page: Page, title: string) => page.locator(".tree-note", { hasText: title });

test("長い題は折り返して全部が見え、本文の列の幅が変わっても高さが付いていく", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, LONG_TITLE);
  const title = titleInput(page);
  const fitsContent = () => title.evaluate((input: HTMLTextAreaElement) => input.scrollHeight <= input.clientHeight + 1 && input.scrollWidth <= input.clientWidth);
  expect(await fitsContent()).toBe(true);
  const heightOnWideWindow = (await title.boundingBox())!.height;
  // 1 行ぶん（30px × 1.4）より高い。
  expect(heightOnWideWindow).toBeGreaterThan(80);
  await page.setViewportSize({ width: 960, height: 820 });
  await expect.poll(async () => (await title.boundingBox())!.height).toBeGreaterThan(heightOnWideWindow);
  expect(await fitsContent()).toBe(true);
});

test("スマホでも、長い題は折り返して全部が見える", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(page);
  await page.locator(".fab").click();
  await titleInput(page).fill(LONG_TITLE);
  expect(await titleInput(page).evaluate((input: HTMLTextAreaElement) => input.scrollHeight <= input.clientHeight + 1)).toBe(true);
  expect((await titleInput(page).boundingBox())!.height).toBeGreaterThan(100);
});

test("題の途中で Enter を押すと、カーソルから後ろが本文の先頭の行になる。貼り付けた改行は題に入らない", async ({ page }) => {
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await titleInput(page).fill("会議のメモ議題の一覧");
  for (let step = 0; step < 5; step += 1) {
    await page.keyboard.press("ArrowLeft");
  }
  await page.keyboard.press("Enter");
  await expect(titleInput(page)).toHaveValue("会議のメモ");
  await expect(page.locator(".ProseMirror p").first()).toHaveText("議題の一覧");
  // カーソルは本文の先頭にある。
  await page.keyboard.type("今日の");
  await expect(page.locator(".ProseMirror p").first()).toHaveText("今日の議題の一覧");

  await titleInput(page).fill("一行目\n二行目");
  await expect(titleInput(page)).toHaveValue("一行目 二行目");
});

test("題の ↓ で本文の先頭へ、本文の 1 行目の ↑ と先頭の Backspace で題の末尾へ移る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "行き来");
  await page.keyboard.type("本文の一行目");
  await page.keyboard.press("Enter");
  await page.keyboard.type("本文の二行目");

  await page.keyboard.press("ArrowUp");
  await expect.poll(() => textOfBlockAtCursor(page)).toBe("本文の一行目");
  await expect(page.locator(".ProseMirror")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(titleInput(page)).toBeFocused();
  expect(await cursorOffsetInTitle(page)).toBe("行き来".length);

  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".ProseMirror")).toBeFocused();
  await page.keyboard.type("★");
  await expect(page.locator(".ProseMirror p").first()).toHaveText("★本文の一行目");

  await placeCursorInBlock(page, "★本文の一行目", "start");
  await page.keyboard.press("Backspace");
  await expect(titleInput(page)).toBeFocused();
  // 本文は消えていない。
  await expect(page.locator(".ProseMirror p").first()).toHaveText("★本文の一行目");
  await page.keyboard.type("の題");
  await expect(titleInput(page)).toHaveValue("行き来の題");
});

test("折り返した題では、↓ は題の中の次の行へ動き、最後の行でだけ本文へ移る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, LONG_TITLE);
  await titleInput(page).click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("ArrowDown");
  await expect(titleInput(page)).toBeFocused();
  expect(await cursorOffsetInTitle(page)).toBeGreaterThan(0);
  await page.keyboard.press("Control+End");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".ProseMirror")).toBeFocused();
});

test("本文が区切り線で始まるメモでも、題の Enter と ↓ で本文へ移れ、選んだ区切り線の ↑ で題へ戻る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "線で始まる");
  await insertFromSlashMenu(page, "区切り", "区切り線");
  await titleInput(page).click();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".ProseMirror")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(titleInput(page)).toBeFocused();
});

test("題の変換中の未確定の文字は保存せず、確定したときに保存する", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "変換は Chromium の DevTools で作る");
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await titleInput(page).click();
  const devTools = await page.context().newCDPSession(page);
  await devTools.send("Input.imeSetComposition", { text: "かいぎ", selectionStart: 3, selectionEnd: 3 });
  await expect(titleInput(page)).toHaveValue("かいぎ");
  await expect(savedTitleInSidebar(page, "かいぎ")).toHaveCount(0);
  await devTools.send("Input.insertText", { text: "会議" });
  await expect(titleInput(page)).toHaveValue("会議");
  await expect(savedTitleInSidebar(page, "会議")).toHaveCount(1);
});

test("変換中の ↓ と Enter は、題から本文へ移らない", async ({ page }) => {
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await titleInput(page).fill("かいぎ");
  for (const key of ["ArrowDown", "Enter"]) {
    await page.evaluate((pressedKey) => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: pressedKey, keyCode: 229, isComposing: true, bubbles: true, cancelable: true }));
    }, key);
    await expect(titleInput(page)).toBeFocused();
  }
});

// 同じメモを、同じブラウザの 2 つ目のタブで開く（タブどうしの変更は、同期と同じく相手の画面に届く）。
async function openSameNoteInSecondTab(page: Page, sidebarText: string): Promise<Page> {
  const secondTab = await page.context().newPage();
  await secondTab.goto("/");
  await secondTab.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await secondTab.getByRole("button", { name: "解除" }).click();
  await secondTab.locator(".tree-note", { hasText: sidebarText }).first().click();
  return secondTab;
}

// 別のウィンドウで開いたとき、まだ題が届いていないと、新しい空のメモとして題の欄にフォーカスが入る。
// そのあとに届いた題を、まだ打っていない題の欄が出さないと、題が空のまま残る（noteWindows.spec.ts がときどき落ちた形）。
test("空の題の欄にフォーカスがあっても、まだ打っていなければ、ほかのウィンドウで付けた題に替わる", async ({ page, context }) => {
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await expect(titleInput(page)).toBeFocused();
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  const opened = context.waitForEvent("page");
  await page.getByRole("menuitem", { name: "別のウィンドウで開く" }).click();
  const noteWindow = await opened;
  await expect(titleInput(noteWindow)).toBeFocused();
  await titleInput(page).fill("買い物");
  await expect(titleInput(noteWindow)).toHaveValue("買い物");
});

test("題の欄で打ちかけの文字は、ほかのタブで題が変わっても上書きされない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "元の題");
  const secondTab = await openSameNoteInSecondTab(page, "元の題");
  await titleInput(secondTab).click();
  await secondTab.keyboard.press("End");
  await secondTab.keyboard.type("に足す");
  await expect(titleInput(secondTab)).toHaveValue("元の題に足す");
  // 2 つ目のタブで打った題が 1 つ目のタブに届いてから、1 つ目のタブで題を変える。2 つ目のタブの打ちかけの文字は、そのまま残る。
  await expect(titleInput(page)).toHaveValue("元の題に足す");
  await titleInput(page).fill("別の題");
  await expect(savedTitleInSidebar(secondTab, "別の題")).toBeVisible();
  await expect(titleInput(secondTab)).toHaveValue("元の題に足す");
});

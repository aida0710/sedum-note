import { expect, type Locator, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, insertBodyHtml, startLocalVault } from "./devices";

// 「段落 1」〜「段落 80」。10 段落ごとに「目印」の言葉を入れる（8 か所）。窓には 20 段落ほどしか入らない。
const LONG_BODY_HTML = Array.from({ length: 80 }, (_unused, index) => `<p>段落 ${index + 1}${(index + 1) % 10 === 0 ? " 目印" : ""}</p>`).join("");

const findInput = (page: Page) => page.getByPlaceholder("このメモの中を検索");
const activeMatch = (page: Page) => page.locator(".ProseMirror .search-match.active");

// 要素が、本文を縦に送る枠の中に全部見えているか。
async function isInsideBodyFrame(page: Page, element: Locator): Promise<boolean> {
  const frame = await page.locator(".document-scroll").boundingBox();
  const box = await element.boundingBox();
  return frame !== null && box !== null && box.y >= frame.y && box.y + box.height <= frame.y + frame.height;
}

async function openLongNote(page: Page): Promise<void> {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "長いメモ");
  await insertBodyHtml(page, LONG_BODY_HTML);
}

test("長いメモの中の検索は、打つとカーソルより後ろの最初の当たりを、Enter を押すたびに次の当たりを、窓の中に見せる", async ({ page }) => {
  await openLongNote(page);
  // カーソルを先頭へ戻し、窓も先頭に送っておく。
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+f");
  await findInput(page).fill("目印");
  await expect(page.locator(".find-bar").getByRole("status")).toHaveText("1 / 8");
  await expect.poll(() => isInsideBodyFrame(page, activeMatch(page))).toBe(true);
  for (const position of ["2 / 8", "3 / 8", "4 / 8"]) {
    await findInput(page).press("Enter");
    await expect(page.locator(".find-bar").getByRole("status")).toHaveText(position);
    await expect.poll(() => isInsideBodyFrame(page, activeMatch(page))).toBe(true);
  }
  await expect(activeMatch(page).locator("xpath=ancestor::p")).toHaveText("段落 40 目印");
  // 前の当たりへ戻るときも見える。
  await findInput(page).press("Shift+Enter");
  await expect.poll(() => isInsideBodyFrame(page, activeMatch(page))).toBe(true);
});

test("検索の欄を Esc で閉じると、選んでいた当たりが本文で選ばれ、続けて打った文字がそこに入る", async ({ page }) => {
  await openLongNote(page);
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+f");
  await findInput(page).fill("目印");
  await findInput(page).press("Enter");
  await findInput(page).press("Escape");
  await expect(page.getByRole("search")).toHaveCount(0);
  await expect(page.locator(".ProseMirror")).toBeFocused();
  await page.keyboard.type("しおり");
  await expect(page.locator(".ProseMirror p", { hasText: "段落 20" })).toHaveText("段落 20 しおり");
});

test("当たりが無いまま検索の欄を閉じても、本文へフォーカスが戻り、元のカーソルの所に打てる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "短いメモ");
  await page.keyboard.type("りんご");
  await page.keyboard.press("Control+f");
  await findInput(page).fill("みかん");
  await page.getByRole("search").getByRole("button", { name: "閉じる" }).click();
  await page.keyboard.type("の木");
  await expect(page.locator(".ProseMirror")).toHaveText("りんごの木");
});

test("ズームしている間に検索の欄を Esc で閉じても、ズームからは戻らない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "計画");
  await page.keyboard.type("- 宿の予約");
  await page.keyboard.press("Control+.");
  await page.keyboard.press("Control+f");
  await findInput(page).fill("予約");
  await findInput(page).press("Escape");
  await expect(page.getByRole("search")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^「.*」に戻る$/ })).toBeVisible();
});

test("折りたたんだ見出しと項目の中の当たりへ移ると、開いて見せる。題の行の当たりでは開かない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "折りたたみ");
  await insertBodyHtml(page, "<h2>準備</h2><p>切符を買う</p><ul><li><p>荷物</p><ul><li><p>切符の控え</p></li></ul></li></ul>");
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "すべて折りたたむ" }).click();
  await expect(page.locator(".ProseMirror p", { hasText: "切符を買う" })).toBeHidden();

  await page.keyboard.press("Control+f");
  await findInput(page).fill("荷物");
  // 「荷物」はたたんだ見出しの中にあるので見出しは開くが、「荷物」の項目は題の行に当たっただけなので、たたんだまま。
  await expect(activeMatch(page)).toBeVisible();
  await expect(page.locator(".ProseMirror p", { hasText: "切符の控え" })).toBeHidden();
  await findInput(page).fill("控え");
  await expect(activeMatch(page)).toBeVisible();
  await expect(page.locator(".ProseMirror p", { hasText: "切符の控え" })).toBeVisible();
});

test("左の列の検索から開いたメモは、最初の当たりまで送る。同じ言葉のままタブを戻したときは、前に見ていた位置に戻る", async ({ page }) => {
  await openLongNote(page);
  await createNoteOnDesktop(page, "別のメモ");
  await page.keyboard.press("Control+Shift+f");
  await page.getByPlaceholder("メモを検索").fill("段落 60");
  await page.locator(".tree-note", { hasText: "長いメモ" }).click();
  const firstMatch = page.locator(".ProseMirror .search-match").first();
  await expect.poll(() => isInsideBodyFrame(page, firstMatch)).toBe(true);

  // 先頭まで送ってから別のタブへ移り、戻る。
  await page.locator(".document-scroll").evaluate((scroll) => { scroll.scrollTop = 0; });
  await page.getByRole("tab", { name: "別のメモ" }).click();
  await page.getByRole("tab", { name: "長いメモ" }).click();
  await expect(page.locator(".ProseMirror .search-match").first()).toBeAttached();
  await expect.poll(() => page.locator(".document-scroll").evaluate((scroll) => scroll.scrollTop)).toBe(0);
});

test("正規表現が読めないときは、入力欄の下に知らせを出し、入力欄の幅は変わらない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "正規表現");
  await page.keyboard.press("Control+f");
  await page.getByRole("button", { name: "正規表現で探す" }).click();
  await findInput(page).fill("abc");
  const widthBefore = (await findInput(page).boundingBox())!.width;
  await findInput(page).fill("(abc");
  await expect(page.locator(".find-bar").getByRole("alert")).toHaveText("正規表現が正しくありません");
  expect((await findInput(page).boundingBox())!.width).toBe(widthBefore);
});

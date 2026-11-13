import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, insertBodyHtml, placeCursorInBlock, startLocalVault } from "./devices";

// 「親」（子「子 1」を持ち、たたんである）と「次の項目」の箇条書き。
const FOLDED_LIST_HTML = '<ul><li data-collapsed="true"><p>親</p><ul><li><p>子 1</p></li></ul></li><li><p>次の項目</p></li></ul><p>末尾</p>';

const line = (page: Page, text: string) => page.locator(".ProseMirror p", { hasText: new RegExp(`^${text}$`) });
const zoomBackButton = (page: Page) => page.getByRole("button", { name: /^「.*」に戻る$/ });

// 箇条書きの形。項目の文字と、子の項目を入れ子にした配列で返す（たたんだ項目には「（たたみ）」を付ける）。
type ListShape = Array<string | ListShape>;
const listShape = (page: Page) => page.evaluate(() => {
  type Shape = Array<string | Shape>;
  const shapeOf = (list: Element): Shape => [...list.children].flatMap((item) => {
    const title = `${item.querySelector(":scope > p")?.textContent ?? ""}${item.getAttribute("data-collapsed") === "true" ? "（たたみ）" : ""}`;
    const nested = item.querySelector(":scope > ul");
    return nested ? [title, shapeOf(nested)] : [title];
  });
  return shapeOf(document.querySelector(".ProseMirror > ul")!);
}) as Promise<ListShape>;

async function openNoteWith(page: Page, html: string): Promise<void> {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "折りたたみとキー");
  await insertBodyHtml(page, html);
}

test("たたんだ項目にズームすると、子の項目が見える（たたんだ印は変えない）", async ({ page }) => {
  await openNoteWith(page, FOLDED_LIST_HTML);
  await expect(line(page, "子 1")).toBeHidden();
  await placeCursorInBlock(page, "親", "end");
  await page.keyboard.press("Control+.");
  await expect(zoomBackButton(page)).toBeVisible();
  await expect(line(page, "子 1")).toBeVisible();
  // ズームから戻ると、たたんだまま。
  await page.keyboard.press("Escape");
  await expect(zoomBackButton(page)).toHaveCount(0);
  await expect(line(page, "子 1")).toBeHidden();
  expect(await listShape(page)).toEqual(["親（たたみ）", ["子 1"], "次の項目"]);
});

test("たたんだ項目のすぐ下の項目で Tab を押すと、たたんだ項目が開き、字下げした項目が見えたままになる", async ({ page }) => {
  await openNoteWith(page, FOLDED_LIST_HTML);
  await placeCursorInBlock(page, "次の項目", "end");
  await page.keyboard.press("Tab");
  expect(await listShape(page)).toEqual(["親", ["子 1", "次の項目"]]);
  await expect(line(page, "次の項目")).toBeVisible();
  await page.keyboard.type("に書き足す");
  await expect(line(page, "次の項目に書き足す")).toBeVisible();
});

test("たたんだ項目の末尾で Enter を押すと、隠れた子は元の項目に残り、子のまとまりの後ろに新しい項目ができる", async ({ page }) => {
  await openNoteWith(page, FOLDED_LIST_HTML);
  await placeCursorInBlock(page, "親", "end");
  await page.keyboard.press("Enter");
  await page.keyboard.type("新しい項目");
  expect(await listShape(page)).toEqual(["親（たたみ）", ["子 1"], "新しい項目", "次の項目"]);
  await expect(line(page, "新しい項目")).toBeVisible();
});

test("開いている項目を途中で分けたとき、新しい項目はたたんだ印を引き継がない", async ({ page }) => {
  await openNoteWith(page, FOLDED_LIST_HTML);
  await placeCursorInBlock(page, "親", "start");
  await page.keyboard.press("Enter");
  // 先頭で分けると、空の項目が上にでき、「親」と子は下の項目に残る。上の空の項目は、子が無いのでたたまない。
  expect(await listShape(page)).toEqual(["", "親（たたみ）", ["子 1"], "次の項目"]);
});

test("たたんだ見出しの末尾で Enter を押すと、見出しが開き、打った文字は見出しのすぐ下の見える段落に入る", async ({ page }) => {
  await openNoteWith(page, '<h2 data-collapsed="true">たたんだ見出し</h2><p>隠れた段落</p><h2>次の見出し</h2><p>末尾</p>');
  await expect(line(page, "隠れた段落")).toBeHidden();
  await placeCursorInBlock(page, "たたんだ見出し", "end");
  await page.keyboard.press("Enter");
  await page.keyboard.type("新しい段落");
  await expect(line(page, "新しい段落")).toBeVisible();
  await expect(line(page, "隠れた段落")).toBeVisible();
  await expect(page.locator(".ProseMirror > *")).toHaveText(["たたんだ見出し", "新しい段落", "隠れた段落", "次の見出し", "末尾"]);
});

test("たたんだ見出しの先頭で Enter を押すと、たたんだまま、上に空の段落ができる", async ({ page }) => {
  await openNoteWith(page, '<p>前の段落</p><h2 data-collapsed="true">たたんだ見出し</h2><p>隠れた段落</p>');
  await placeCursorInBlock(page, "たたんだ見出し", "start");
  await page.keyboard.press("Enter");
  await expect(line(page, "隠れた段落")).toBeHidden();
  await expect(page.locator(".ProseMirror > *")).toHaveText(["前の段落", "", "たたんだ見出し", "隠れた段落"]);
});

test("たたんだ見出しのセクションにズームすると、中身が見える", async ({ page }) => {
  await openNoteWith(page, '<h2 data-collapsed="true">たたんだ見出し</h2><p>隠れた段落</p><h2>次の見出し</h2>');
  await placeCursorInBlock(page, "たたんだ見出し", "end");
  await page.keyboard.press("Control+.");
  await expect(zoomBackButton(page)).toBeVisible();
  await expect(line(page, "隠れた段落")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(line(page, "隠れた段落")).toBeHidden();
});

test("項目にズームしている間、直下の子の項目の先頭で Backspace を押しても、子はズームの外へ出ない", async ({ page }) => {
  await openNoteWith(page, "<ul><li><p>親</p><ul><li><p>子 1</p></li><li><p>子 2</p></li></ul></li><li><p>次の項目</p></li></ul><p>末尾</p>");
  await placeCursorInBlock(page, "親", "end");
  await page.keyboard.press("Control+.");
  await placeCursorInBlock(page, "子 2", "start");
  await page.keyboard.press("Backspace");
  await expect(zoomBackButton(page)).toBeVisible();
  await expect(line(page, "子 2")).toBeVisible();
  expect(await listShape(page)).toEqual(["親", ["子 1", "子 2"], "次の項目"]);
});

test("項目にズームしている間、直下の子の項目で Shift+Tab を押しても、子はズームの外へ出ない", async ({ page }) => {
  await openNoteWith(page, "<ul><li><p>親</p><ul><li><p>子 1</p></li><li><p>子 2</p></li></ul></li><li><p>次の項目</p></li></ul><p>末尾</p>");
  await placeCursorInBlock(page, "親", "end");
  await page.keyboard.press("Control+.");
  await expect(zoomBackButton(page)).toBeVisible();
  await placeCursorInBlock(page, "子 1", "end");
  await page.keyboard.press("Shift+Tab");
  await expect(zoomBackButton(page)).toBeVisible();
  await expect(line(page, "子 1")).toBeVisible();
  expect(await listShape(page)).toEqual(["親", ["子 1", "子 2"], "次の項目"]);
  // 孫の項目は、ズームの中で 1 段浅くできる。
  await placeCursorInBlock(page, "子 2", "end");
  await page.keyboard.press("Tab");
  expect(await listShape(page)).toEqual(["親", ["子 1", ["子 2"]], "次の項目"]);
  await page.keyboard.press("Shift+Tab");
  expect(await listShape(page)).toEqual(["親", ["子 1", "子 2"], "次の項目"]);
});

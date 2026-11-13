import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, insertBodyHtml, PHONE_VIEWPORT, placeCursorInBlock, startLocalVault } from "./devices";

const LINK_URL = "https://example.com/docs/guide";
const BODY_WITH_LINK_HTML = `<p>資料は <a href="${LINK_URL}">こちらの手引き</a> にある</p><p>次の段落</p>`;

const linkPopover = (page: Page) => page.getByRole("group", { name: "リンク" });

// window.open で開こうとした URL を控える（外のページは開かない）。
async function recordOpenedUrls(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const openedUrls: string[] = [];
    (window as unknown as { openedUrls: string[] }).openedUrls = openedUrls;
    window.open = (url) => {
      openedUrls.push(String(url));
      return null;
    };
  });
  return () => page.evaluate(() => (window as unknown as { openedUrls: string[] }).openedUrls);
}

test("リンクの中にカーソルを置くと、リンク先の URL と「開く」「編集」「解除」が出る。「開く」で外のブラウザに渡す", async ({ page }) => {
  const openedUrls = await recordOpenedUrls(page);
  await startLocalVault(page);
  await createNoteOnDesktop(page, "リンク");
  await insertBodyHtml(page, BODY_WITH_LINK_HTML);
  await expect(linkPopover(page)).toHaveCount(0);

  await page.locator(".ProseMirror a").click();
  await expect(linkPopover(page)).toContainText(LINK_URL);
  // リンクの行のすぐ下に出て、リンクの文字を覆わない。
  const linkBox = (await page.locator(".ProseMirror a").boundingBox())!;
  const popoverBox = (await linkPopover(page).boundingBox())!;
  expect(popoverBox.y).toBeGreaterThanOrEqual(linkBox.y + linkBox.height);
  expect(popoverBox.y - (linkBox.y + linkBox.height)).toBeLessThan(16);

  await linkPopover(page).getByRole("button", { name: "リンクを開く" }).click();
  expect(await openedUrls()).toEqual([LINK_URL]);
  // 押しても本文のフォーカスは動かず、面は出たまま。
  await expect(page.locator(".ProseMirror")).toBeFocused();

  // リンクの外へカーソルを移すと消える。
  await placeCursorInBlock(page, "次の段落", "end");
  await expect(linkPopover(page)).toHaveCount(0);
});

test("リンクの面の「編集」でリンク先を変えられ、「解除」でリンクだけが外れて文字は残る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "リンク");
  await insertBodyHtml(page, BODY_WITH_LINK_HTML);
  await page.locator(".ProseMirror a").click();
  await linkPopover(page).getByRole("button", { name: "リンクを編集" }).click();
  const urlInput = page.getByRole("dialog").getByRole("textbox");
  await expect(urlInput).toHaveValue(LINK_URL);
  await urlInput.fill("https://example.org/new");
  await urlInput.press("Enter");
  await expect(page.locator(".ProseMirror a")).toHaveAttribute("href", "https://example.org/new");
  await expect(page.locator(".ProseMirror a")).toHaveText("こちらの手引き");

  await page.locator(".ProseMirror a").click();
  await linkPopover(page).getByRole("button", { name: "リンクを解除" }).click();
  await expect(page.locator(".ProseMirror a")).toHaveCount(0);
  await expect(page.locator(".ProseMirror p").first()).toHaveText("資料は こちらの手引き にある");
});

test("Ctrl を押しながらリンクを押すと、外のブラウザで開く。http・https・mailto 以外のリンク先は開かない", async ({ page }) => {
  const openedUrls = await recordOpenedUrls(page);
  await startLocalVault(page);
  await createNoteOnDesktop(page, "リンク");
  await insertBodyHtml(page, BODY_WITH_LINK_HTML);
  await page.locator(".ProseMirror a").click({ modifiers: ["Control"] });
  expect(await openedUrls()).toEqual([LINK_URL]);

  // 取り込みなどで入った、開いてはいけない種類のリンク先。
  await page.evaluate(() => {
    const body = document.querySelector(".ProseMirror") as HTMLElement & { editor: { commands: { setContent: (content: unknown) => boolean } } };
    body.editor.commands.setContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "あやしいリンク", marks: [{ type: "link", attrs: { href: "file:///etc/passwd" } }] }] }] });
  });
  await page.locator(".ProseMirror a").click({ modifiers: ["Control"] });
  expect(await openedUrls()).toEqual([LINK_URL]);
  await page.locator(".ProseMirror a").click();
  await expect(linkPopover(page)).toContainText("file:///etc/passwd");
  await expect(linkPopover(page).getByRole("button", { name: "リンクを開く" })).toHaveCount(0);
});

test("スマホでも、リンクの中にカーソルを置くとリンク先と「開く」が出て、画面の幅からはみ出さない", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(page);
  await page.locator(".fab").click();
  await page.getByPlaceholder("タイトル").fill("リンク");
  await page.getByPlaceholder("タイトル").press("Enter");
  await insertBodyHtml(page, `<p>長い URL の <a href="${LINK_URL}/${"very-long-path/".repeat(8)}">リンク</a></p>`);
  await page.locator(".ProseMirror a").click();
  await expect(linkPopover(page).getByRole("button", { name: "リンクを開く" })).toBeVisible();
  const popoverBox = (await linkPopover(page).boundingBox())!;
  expect(popoverBox.x).toBeGreaterThanOrEqual(0);
  expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(PHONE_VIEWPORT.width);
});

import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, insertBodyHtml, placeCursorInBlock, startLocalVault } from "./devices";

const DIAGRAM_HTML = '<pre><code class="language-mermaid">flowchart LR\n  A[はじめ] --> B[おわり]</code></pre>';

const diagram = (page: Page) => page.locator(".ProseMirror .mermaid-diagram");

function cssVariable(page: Page, name: string): Promise<string> {
  return page.evaluate((variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(), name);
}

test("箇条書きの項目にズームしている間と、図のある見出しをたたんでいる間は、隠れた所の Mermaid の図も出ない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "図のメモ");
  await insertBodyHtml(page, `<ul><li><p>項目</p></li></ul><h2>図の見出し</h2>${DIAGRAM_HTML}<p>末尾</p>`);
  await placeCursorInBlock(page, "末尾", "end");
  await expect(diagram(page).locator("svg")).toBeVisible();

  await placeCursorInBlock(page, "項目", "end");
  await page.keyboard.press("Control+.");
  await expect(page.getByRole("button", { name: /^「.*」に戻る$/ })).toBeVisible();
  await expect(diagram(page)).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(diagram(page)).toBeVisible();

  await page.locator(".ProseMirror h2").hover();
  await page.locator(".ProseMirror h2 .fold-toggle").click();
  await expect(page.locator(".ProseMirror p", { hasText: "末尾" })).toBeHidden();
  await expect(diagram(page)).toBeHidden();
});

test("テーマが変わると、Mermaid の図を新しいテーマの色で描き直す", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "図のメモ");
  await insertBodyHtml(page, `${DIAGRAM_HTML}<p>末尾</p>`);
  await expect(diagram(page).locator("svg")).toBeVisible();
  const lightNodeColor = await cssVariable(page, "--accent-soft");
  expect(await diagram(page).innerHTML()).toContain(lightNodeColor);

  // 既定のテーマは OS に合わせるので、OS をダークにするとテーマが変わる。
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => cssVariable(page, "--accent-soft")).not.toBe(lightNodeColor);
  const darkNodeColor = await cssVariable(page, "--accent-soft");
  await expect.poll(() => diagram(page).innerHTML()).toContain(darkNodeColor);
  expect(await diagram(page).innerHTML()).not.toContain(lightNodeColor);
});

import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, startLocalVault } from "./devices";

const SCREENSHOT_DIRECTORY = process.env.SCREENSHOT_DIRECTORY;
const body = (page: Page) => page.locator(".ProseMirror").first();

async function chooseInNoteMenu(page: Page, itemName: string): Promise<void> {
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: itemName }).click();
}

// 項目の並びを、字下げの段と文字の組にする（例: ["0 旅行", "1 宿"]）。
async function outlineLines(page: Page): Promise<string[]> {
  return body(page).locator("li > p:first-of-type").evaluateAll((lines) => lines.map((line) => {
    let depth = -1;
    for (let element: Element | null = line; element && !element.classList.contains("ProseMirror"); element = element.parentElement) {
      depth += element.tagName === "UL" ? 1 : 0;
    }
    return `${depth} ${line.textContent}`;
  }));
}

test("アウトライン表示にすると、見出しは親の項目に、段落は項目になる。打った行はすべて項目になり、Tab で階層を変えられる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "計画");
  await page.keyboard.type("## 旅行");
  await page.keyboard.press("Enter");
  await page.keyboard.type("宿を決める");
  await chooseInNoteMenu(page, "アウトライン表示にする");
  await expect.poll(() => outlineLines(page)).toEqual(["0 旅行", "1 宿を決める"]);
  // 本文は箇条書き 1 つだけで、末尾に空の段落は付かない。
  await expect(body(page).locator("> *")).toHaveCount(1);

  await body(page).locator("p", { hasText: "宿を決める" }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("持ち物");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("充電器");
  await expect.poll(() => outlineLines(page)).toEqual(["0 旅行", "1 宿を決める", "1 持ち物", "2 充電器"]);
  if (SCREENSHOT_DIRECTORY) {
    await page.screenshot({ path: `${SCREENSHOT_DIRECTORY}/outline-note.png` });
  }

  // 開き直しても、アウトライン表示のまま。
  await createNoteOnDesktop(page, "別のメモ");
  await page.getByRole("tab", { name: "計画" }).click();
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await expect(page.getByRole("menuitem", { name: "ふつうの表示に戻す" })).toBeVisible();
});

test("アウトライン表示では、空の項目で Enter や Backspace を押しても、箇条書きの外に行ができない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "計画");
  await page.keyboard.type("旅行");
  await chooseInNoteMenu(page, "アウトライン表示にする");
  await body(page).locator("p", { hasText: "旅行" }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  // 空の項目での Enter は、ふつうの箇条書きでは箇条書きを抜ける。アウトラインでは項目のまま。
  await page.keyboard.press("Enter");
  await page.keyboard.type("宿");
  await expect(body(page).locator("> *")).toHaveCount(1);
  await expect.poll(() => outlineLines(page)).toEqual(["0 旅行", "0 宿"]);

  // 項目の先頭での Backspace も、箇条書きの外には出ない。
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("と");
  await expect(body(page).locator("> *")).toHaveCount(1);
  await expect(body(page)).toContainText("宿");

  // ふつうの表示に戻すと、本文は箇条書きのまま残り、箇条書きの外にも書けるようになる。
  await chooseInNoteMenu(page, "ふつうの表示に戻す");
  await expect(body(page).locator("> p")).toHaveCount(1);
});

test("箇条書きの項目を、持ち手をドラッグして、子ごと別の位置へ動かせる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "計画");
  await page.keyboard.type("- 1 つ目");
  await page.keyboard.press("Enter");
  await page.keyboard.type("2 つ目");
  await page.keyboard.press("Enter");
  await page.keyboard.type("3 つ目");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("3 の子");
  await chooseInNoteMenu(page, "アウトライン表示にする");
  await expect.poll(() => outlineLines(page)).toEqual(["0 1 つ目", "0 2 つ目", "0 3 つ目", "1 3 の子"]);

  await body(page).locator("p", { hasText: "3 つ目" }).hover();
  const handle = page.getByRole("button", { name: "ドラッグしてブロックを動かす" });
  await expect(handle).toBeVisible();
  const handleBox = (await handle.boundingBox())!;
  const firstItemBox = (await body(page).locator("li").first().boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(firstItemBox.x + 10, firstItemBox.y + 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => outlineLines(page)).toEqual(["0 3 つ目", "1 3 の子", "0 1 つ目", "0 2 つ目"]);
});

import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, startLocalVault } from "./devices";

const SCREENSHOT_DIRECTORY = process.env.SCREENSHOT_DIRECTORY;
const zoomBar = (page: Page) => page.getByRole("navigation", { name: "ズームしている所までの道筋" });
// 画面に出ている本文の行。
const visibleLines = (page: Page) => page.locator(".ProseMirror p:visible");

// text だけの行を押して、カーソルを置く。押した直後は、エディタの中の選択が少し遅れて追いつくので、
// エディタの選択（Tiptap が本文の要素に付ける editor から読む）がその行に移ったのを確かめてから戻る。
async function placeCursorIn(page: Page, text: string): Promise<void> {
  await page.locator(".ProseMirror p", { hasText: new RegExp(`^${text}$`) }).click();
  await expect.poll(() => page.evaluate(() => {
    const body = document.querySelector(".ProseMirror") as (HTMLElement & { editor?: { state: { selection: { $from: { parent: { textContent: string } } } } } }) | null;
    return body?.editor?.state.selection.$from.parent.textContent ?? null;
  })).toBe(text);
}

async function zoomIntoItem(page: Page, text: string): Promise<void> {
  await placeCursorIn(page, text);
  await page.keyboard.press("Control+Alt+z");
  await expect(zoomBar(page).locator("[aria-current]")).toHaveText(text);
}

// 「旅行 > 宿 > 駅前のホテル」「旅行 > 持ち物」の箇条書きと、その前後の段落を書く。カーソルは「駅前のホテル」に置く。
async function writeNestedList(page: Page): Promise<void> {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "計画");
  await page.keyboard.type("はじめに");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- 旅行");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("宿");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("駅前のホテル");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("持ち物");
  await placeCursorIn(page, "駅前のホテル");
  await expect(page.locator(".ProseMirror p")).toHaveText(["はじめに", "旅行", "宿", "駅前のホテル", "持ち物", ""]);
}

test("箇条書きの項目にズームすると、その項目と子だけが出る。パンくずから上の階層と全体へ戻れる", async ({ page }) => {
  await writeNestedList(page);
  // カーソルのある「駅前のホテル」から、キーで 1 つ上の「宿」へ戻る形で確かめる。
  await zoomIntoItem(page, "駅前のホテル");
  await expect(visibleLines(page)).toHaveText(["駅前のホテル"]);
  await expect(zoomBar(page)).toHaveText("全体旅行宿駅前のホテル");
  await page.keyboard.press("Control+Alt+Shift+z");
  await expect(visibleLines(page)).toHaveText(["宿", "駅前のホテル"]);
  if (SCREENSHOT_DIRECTORY) {
    await page.screenshot({ path: `${SCREENSHOT_DIRECTORY}/zoomed-item.png` });
  }

  // ズームしたまま書き足せる。本文は変わらず、隠れているだけ。
  await page.keyboard.press("Enter");
  await page.keyboard.type("朝食つき");
  await expect(visibleLines(page)).toHaveText(["宿", "駅前のホテル", "朝食つき"]);

  await zoomBar(page).getByRole("button", { name: "旅行" }).click();
  await expect(visibleLines(page)).toHaveText(["旅行", "宿", "駅前のホテル", "朝食つき", "持ち物"]);
  await zoomBar(page).getByRole("button", { name: "全体" }).click();
  await expect(zoomBar(page)).toHaveCount(0);
  await expect(visibleLines(page)).toHaveText(["はじめに", "旅行", "宿", "駅前のホテル", "朝食つき", "持ち物", ""]);
});

test("メモのメニューからもズームできる。ズームしている間の全選択は、見えている項目の中だけに掛かる", async ({ page }) => {
  await writeNestedList(page);
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "この項目にズーム" }).click();
  await expect(visibleLines(page)).toHaveText(["駅前のホテル"]);

  // ズームしている間の全選択は、見えている項目の中だけを選ぶ。消しても、隠れている行は残る。
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await zoomBar(page).getByRole("button", { name: "全体" }).click();
  await expect(visibleLines(page)).toHaveText(["はじめに", "旅行", "宿", "", "持ち物", ""]);

  // 箇条書きの外にカーソルがあるときは、メニューにズームを出さない。
  await placeCursorIn(page, "はじめに");
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await expect(page.getByRole("menuitem", { name: "ピン留め" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "この項目にズーム" })).toHaveCount(0);
});

test("ズームしている項目の題の行で Enter を押すと、カーソルから後ろが最初の子になり、元の子も見えたまま", async ({ page }) => {
  await writeNestedList(page);
  await zoomIntoItem(page, "宿");
  await expect(visibleLines(page)).toHaveText(["宿", "駅前のホテル"]);
  await page.keyboard.press("Enter");
  await page.keyboard.type("予約する");
  await expect(visibleLines(page)).toHaveText(["宿", "予約する", "駅前のホテル"]);
  await zoomBar(page).getByRole("button", { name: "全体" }).click();
  await expect(visibleLines(page)).toHaveText(["はじめに", "旅行", "宿", "予約する", "駅前のホテル", "持ち物", ""]);
});

test("ズームしている間に、ズームの外の見出しへ目次から移ると、ズームをやめて行き先を見せる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "計画");
  await page.keyboard.type("## 行程");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- 宿");
  await page.keyboard.press("Control+Alt+z");
  await expect(visibleLines(page)).toHaveText(["宿"]);
  await page.getByRole("button", { name: "目次" }).click();
  await page.getByRole("navigation", { name: "目次" }).getByRole("button", { name: "行程" }).click();
  await expect(zoomBar(page)).toHaveCount(0);
  await expect(page.locator(".ProseMirror h2")).toBeVisible();
});

test("箇条書きの行頭の印を押すと、その項目にズームする", async ({ page }) => {
  await writeNestedList(page);
  // 「宿」の項目の印（行の左の余白）を押す。
  const lodging = page.locator(".ProseMirror li", { has: page.locator("> p", { hasText: /^宿$/ }) });
  const firstLine = (await lodging.locator("> p").boundingBox())!;
  await page.mouse.click(firstLine.x - 10, firstLine.y + firstLine.height / 2);
  await expect(zoomBar(page).locator("[aria-current]")).toHaveText("宿");
  await expect(visibleLines(page)).toHaveText(["宿", "駅前のホテル"]);
});

test("見出しの右端のボタンで、そのセクション（次の同じ段か上の段の見出しの前まで）にズームする。パンくずには上の段の見出しが並ぶ", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "章立て");
  for (const line of ["# 第1章", "前置き", "## 1.1 節", "節の本文", "### 1.1.1 項", "項の本文", "## 1.2 節", "次の節の本文", "# 第2章", "次の章の本文"]) {
    await page.keyboard.type(line);
    await page.keyboard.press("Enter");
  }
  const section = page.locator(".ProseMirror h3", { hasText: "1.1.1 項" });
  await page.locator(".ProseMirror h2", { hasText: "1.1 節" }).hover();
  await page.locator(".ProseMirror h2", { hasText: "1.1 節" }).getByRole("button", { name: "このセクションにズーム" }).click();
  await expect(page.locator(".ProseMirror > :visible")).toHaveText(["1.1 節", "節の本文", "1.1.1 項", "項の本文"]);
  await expect(section).toBeVisible();
  await expect(zoomBar(page)).toHaveText("全体第1章1.1 節");

  // パンくずの「第1章」で、上の段の見出しのセクションへ出る。
  await zoomBar(page).getByRole("button", { name: "第1章" }).click();
  await expect(page.locator(".ProseMirror > :visible")).toHaveText(["第1章", "前置き", "1.1 節", "節の本文", "1.1.1 項", "項の本文", "1.2 節", "次の節の本文"]);

  // カーソルのある見出しには、メモの「…」からもズームできる。
  await zoomBar(page).getByRole("button", { name: "全体" }).click();
  await page.locator(".ProseMirror h1", { hasText: "第2章" }).click();
  await page.locator(".editor-bar").getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "このセクションにズーム" }).click();
  await expect(page.locator(".ProseMirror > :visible").first()).toHaveText("第2章");
  await expect(page.locator(".ProseMirror p", { hasText: "次の章の本文" })).toBeVisible();
  await expect(page.locator(".ProseMirror p", { hasText: "前置き" })).toBeHidden();
});

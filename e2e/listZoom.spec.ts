import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, PHONE_VIEWPORT, startLocalVault } from "./devices";

const SCREENSHOT_DIRECTORY = process.env.SCREENSHOT_DIRECTORY;
// ズームしている間に左上に出る、戻るボタン。名前は「「戻り先」に戻る」。
const zoomBackButton = (page: Page) => page.getByRole("button", { name: /^「.*」に戻る$/ });
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
  await expect(visibleLines(page).first()).toHaveText(text);
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

test("箇条書きの項目にズームすると、窓いっぱいにその項目と子だけが出る。左上の戻るボタンで 1 つずつ上の階層へ戻り、最後に全体へ戻る", async ({ page }) => {
  await writeNestedList(page);
  // カーソルのある「駅前のホテル」から、キーで 1 つ上の「宿」へ戻る形で確かめる。
  await zoomIntoItem(page, "駅前のホテル");
  await expect(visibleLines(page)).toHaveText(["駅前のホテル"]);
  await expect(zoomBackButton(page)).toHaveAccessibleName("「宿」に戻る");
  // 題・ツールバーは出さず、メモの画面が窓いっぱいに広がって、左の列とタブを覆う。
  await expect(page.getByPlaceholder("タイトル")).toHaveCount(0);
  await expect(page.locator(".editor-bar")).toHaveCount(0);
  expect(await page.locator(".note-editor.zoomed-view").boundingBox()).toEqual({ x: 0, y: 0, ...page.viewportSize()! });
  const backBox = (await zoomBackButton(page).boundingBox())!;
  expect(backBox.x).toBeLessThan(40);
  expect(backBox.y).toBeLessThan(40);
  await page.keyboard.press("Control+Alt+Shift+z");
  await expect(visibleLines(page)).toHaveText(["宿", "駅前のホテル"]);
  await expect(zoomBackButton(page)).toHaveAccessibleName("「旅行」に戻る");
  if (SCREENSHOT_DIRECTORY) {
    await page.screenshot({ path: `${SCREENSHOT_DIRECTORY}/zoomed-item.png` });
  }

  // ズームしたまま書き足せる。本文は変わらず、隠れているだけ。
  await page.keyboard.press("Enter");
  await page.keyboard.type("朝食つき");
  await expect(visibleLines(page)).toHaveText(["宿", "駅前のホテル", "朝食つき"]);

  await zoomBackButton(page).click();
  await expect(visibleLines(page)).toHaveText(["旅行", "宿", "駅前のホテル", "朝食つき", "持ち物"]);
  // いちばん上の項目からは、メモの題を添えて、メモ全体へ戻る。
  await expect(zoomBackButton(page)).toHaveAccessibleName("「計画」に戻る");
  await zoomBackButton(page).click();
  await expect(zoomBackButton(page)).toHaveCount(0);
  await expect(page.locator(".note-editor.zoomed-view")).toHaveCount(0);
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("計画");
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
  await page.keyboard.press("Control+Alt+Shift+z");
  await page.keyboard.press("Control+Alt+Shift+z");
  await page.keyboard.press("Control+Alt+Shift+z");
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
  await zoomBackButton(page).click();
  await zoomBackButton(page).click();
  await expect(visibleLines(page)).toHaveText(["はじめに", "旅行", "宿", "予約する", "駅前のホテル", "持ち物", ""]);
});

test("ズームしている間に、メモの中の検索でズームの外の言葉へ移ると、ズームをやめて行き先を見せる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "計画");
  await page.keyboard.type("## 行程");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- 宿");
  await page.keyboard.press("Control+Alt+z");
  await expect(visibleLines(page)).toHaveText(["宿"]);
  await page.keyboard.press("Control+f");
  await page.getByPlaceholder("このメモの中を検索").fill("行程");
  await page.getByPlaceholder("このメモの中を検索").press("Enter");
  await expect(zoomBackButton(page)).toHaveCount(0);
  await expect(page.locator(".ProseMirror h2")).toBeVisible();
});

test("箇条書きの行頭の印を押すと、その項目にズームする", async ({ page }) => {
  await writeNestedList(page);
  // 「宿」の項目の印（行の左の余白）を押す。
  const lodging = page.locator(".ProseMirror li", { has: page.locator("> p", { hasText: /^宿$/ }) });
  const firstLine = (await lodging.locator("> p").boundingBox())!;
  await page.mouse.click(firstLine.x - 10, firstLine.y + firstLine.height / 2);
  await expect(visibleLines(page)).toHaveText(["宿", "駅前のホテル"]);
  await expect(zoomBackButton(page)).toHaveAccessibleName("「旅行」に戻る");
});

test("見出しの左のボタンで、そのセクション（次の同じ段か上の段の見出しの前まで）にズームする。戻るボタンで上の段の見出しのセクションへ戻る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "章立て");
  for (const line of ["# 第1章", "前置き", "## 1.1 節", "節の本文", "### 1.1.1 項", "項の本文", "## 1.2 節", "次の節の本文", "# 第2章", "次の章の本文"]) {
    await page.keyboard.type(line);
    await page.keyboard.press("Enter");
  }
  const section = page.locator(".ProseMirror h3", { hasText: "1.1.1 項" });
  const heading = page.locator(".ProseMirror h2", { hasText: "1.1 節" });
  await heading.hover();
  // ボタンは見出しの文字の左（本文の左の余白）に出る。
  const zoomButton = heading.getByRole("button", { name: "このセクションにズーム" });
  expect((await zoomButton.boundingBox())!.x + (await zoomButton.boundingBox())!.width).toBeLessThanOrEqual((await heading.boundingBox())!.x);
  await zoomButton.click();
  await expect(page.locator(".ProseMirror > :visible")).toHaveText(["1.1 節", "節の本文", "1.1.1 項", "項の本文"]);
  await expect(section).toBeVisible();
  await expect(zoomBackButton(page)).toHaveAccessibleName("「第1章」に戻る");

  // 戻るボタンで、上の段の見出し「第1章」のセクションへ出る。
  await zoomBackButton(page).click();
  await expect(page.locator(".ProseMirror > :visible")).toHaveText(["第1章", "前置き", "1.1 節", "節の本文", "1.1.1 項", "項の本文", "1.2 節", "次の節の本文"]);

  // カーソルのある見出しには、メモの「…」からもズームできる。
  await zoomBackButton(page).click();
  await page.locator(".ProseMirror h1", { hasText: "第2章" }).click();
  await page.locator(".editor-bar").getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "このセクションにズーム" }).click();
  await expect(page.locator(".ProseMirror > :visible").first()).toHaveText("第2章");
  await expect(page.locator(".ProseMirror p", { hasText: "次の章の本文" })).toBeVisible();
  await expect(page.locator(".ProseMirror p", { hasText: "前置き" })).toBeHidden();
});

test("スマホでは、ズームしている間は上の「戻る」が 1 つ上の階層へ戻るボタンになり、全体に戻ってからの「戻る」で一覧へ戻る", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill("計画");
  await page.getByPlaceholder("タイトル").press("Enter");
  await page.keyboard.type("- 旅行");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("宿");
  await placeCursorIn(page, "宿");
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "この項目にズーム" }).click();

  await expect(visibleLines(page)).toHaveText(["宿"]);
  await expect(page.getByPlaceholder("タイトル")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "その他の操作" })).toHaveCount(0);
  await zoomBackButton(page).click();
  await expect(visibleLines(page)).toHaveText(["旅行", "宿"]);
  await expect(zoomBackButton(page)).toHaveAccessibleName("「計画」に戻る");
  await zoomBackButton(page).click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("計画");
  await page.getByRole("button", { name: "戻る", exact: true }).click();
  await expect(page.getByPlaceholder("タイトル")).toHaveCount(0);
});

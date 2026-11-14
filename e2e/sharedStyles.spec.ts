// 画面のあちこちで使う部品の見た目が、置き場所でばらばらにならないか。

import { expect, type Locator, test } from "@playwright/test";
import { addNotebookOnDesktop, createNoteOnDesktop, openSettingsPage, startLocalVault } from "./devices";

const headingStyleOf = (heading: Locator) => heading.evaluate((element) => {
  const style = getComputedStyle(element);
  return { fontSize: style.fontSize, fontWeight: style.fontWeight, letterSpacing: style.letterSpacing, color: style.color };
});

test("区切りの見出しは、左の列でもコマンドパレットでも同じ大きさ・太さ・字の間・色で出る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "会議");
  const sidebarHeading = await headingStyleOf(page.locator(".sidebar .section-title").first());
  await page.keyboard.press("Control+k");
  const paletteHeading = await headingStyleOf(page.locator(".command-palette .menu-heading").first());
  expect(paletteHeading).toEqual(sidebarHeading);
});

test("設定の欄の中の小見出しは、欄の見出しより大きくならない", async ({ page }) => {
  await startLocalVault(page);
  await openSettingsPage(page, "ショートカット");
  const section = page.locator(".settings-section").filter({ has: page.locator("h3") }).first();
  const sizeOf = (heading: Locator) => heading.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(await sizeOf(section.locator("h3").first())).toBeLessThan(await sizeOf(section.locator("h2")));
});

test("1 つを選ぶ並びは、選んでいる 1 つにだけ Tab が止まり、矢印で選べる。選んだ見本にはチェックの印が付く", async ({ page }) => {
  await startLocalVault(page);
  await openSettingsPage(page, "外観");
  const themes = page.getByRole("radiogroup", { name: "テーマ" });
  const checked = themes.getByRole("radio", { checked: true });
  await expect(themes.locator('[role="radio"][tabindex="0"]')).toHaveCount(1);
  await expect(checked.locator(".theme-choice-check")).toBeVisible();

  const before = await checked.textContent();
  await checked.focus();
  await page.keyboard.press("ArrowRight");
  const next = themes.getByRole("radio", { checked: true });
  await expect(next).not.toHaveText(before ?? "");
  await expect(next).toBeFocused();
  await expect(themes.locator(".theme-choice-check")).toHaveCount(1);
  // 並びの中の残りには止まらず、並びの外へ出る。
  await page.keyboard.press("Tab");
  await expect(themes.locator(":focus")).toHaveCount(0);
});

test("お気に入りの星は黄色の印で、押したままの切り替え（目次）は地の色で示し、2 つは別の見た目になる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "会議");
  const rootColor = (name: string) => page.evaluate((variable) => {
    const probe = document.body.appendChild(document.createElement("span"));
    probe.style.color = `var(${variable})`;
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, name);
  const star = page.getByRole("button", { name: "お気に入り", exact: true });
  await star.click();
  await page.mouse.move(0, 0);
  const bookmarked = page.getByRole("button", { name: "お気に入りから外す" });
  await expect(bookmarked).toHaveCSS("color", await rootColor("--bookmark"));
  await expect(bookmarked).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  const outline = page.getByRole("button", { name: "目次" });
  await outline.click();
  await expect(outline).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(0, 0);
  await expect(outline).toHaveCSS("background-color", await rootColor("--selected"));
});

test("スクロールする枠の中の項目のフォーカスの枠は、枠の端で切れないよう内側に描き、名前の変更の欄は輪を二重にしない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "会議");
  const outlineOf = (selector: string) => page.locator(selector).first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { offset: style.outlineOffset, style: style.outlineStyle };
  });
  await page.keyboard.press("Escape");
  await page.locator(".sidebar-scroll .tree-note").first().focus();
  expect((await outlineOf(".sidebar-scroll .tree-note")).offset).toBe("-2px");

  await page.locator(".sidebar-scroll .tree-note").first().dblclick();
  const renameInput = page.locator(".sidebar-scroll .inline-input");
  await expect(renameInput).toBeFocused();
  expect((await outlineOf(".sidebar-scroll .inline-input")).style).toBe("none");
});

test("区切りの無い長い名前でも、データベース表示の見出し・本文の上のタグ・ダイアログの見出しは、欄の外へはみ出さない", async ({ page }) => {
  const longName = "https://example.com/" + "a".repeat(140);
  await startLocalVault(page);
  await addNotebookOnDesktop(page, longName);
  await page.locator(".nav", { hasText: longName }).click();
  await createNoteOnDesktop(page, "メモ");
  await page.keyboard.type(`#${"tag".repeat(60)} `);
  const overflowOf = (selector: string) => page.locator(selector).first().evaluate((element) => {
    const container = element.closest(".document, .database-view")!.getBoundingClientRect();
    // 要素の箱がはみ出す分と、箱の中の文字が箱の外へはみ出す分。
    return Math.max(0, element.getBoundingClientRect().right - container.right, element.scrollWidth - element.clientWidth);
  });
  await expect(page.locator(".document-meta .chip", { hasText: "#tagtag" })).toBeVisible();
  expect(await overflowOf(".document-meta .chip:not(:has(.dot, .notebook-icon))")).toBe(0);

  await page.locator(".nav", { hasText: longName }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "データベース表示" }).click();
  await expect(page.locator(".database-header h1")).toHaveText(longName);
  expect(await overflowOf(".database-header h1")).toBe(0);

  await page.locator(".nav", { hasText: longName }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "色とアイコン" }).click();
  const title = page.getByRole("dialog").locator(".dialog-title");
  await expect(title).toContainText(longName);
  expect(await title.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
});

test("ダイアログの幅は、ダイアログごとの幅（履歴は 760px）になり、ほかは既定の 420px になる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "会議");
  await page.locator(".pane:not(.split-pane)").getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "履歴" }).click();
  expect((await page.getByRole("dialog", { name: "履歴" }).boundingBox())!.width).toBeCloseTo(760, 0);
  await page.keyboard.press("Escape");
  await page.locator(".pane:not(.split-pane)").getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "メモの期限を設定" }).click();
  expect((await page.getByRole("dialog", { name: "メモの期限" }).boundingBox())!.width).toBeCloseTo(420, 0);
});

test("ノートブックを選ぶ一覧では、子のチェックボックスが親のノートブックの印の真下に来る", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "仕事");
  const parentRow = page.locator(".nav-row", { has: page.locator(".nav", { hasText: "仕事" }) });
  await parentRow.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "中にノートブックを追加" }).click();
  await page.getByPlaceholder("ノートブックの名前").fill("議事録");
  await page.getByPlaceholder("ノートブックの名前").press("Enter");
  await createNoteOnDesktop(page, "会議");
  await page.locator(".pane:not(.split-pane)").getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "ノートブックを選ぶ" }).click();
  const dialog = page.getByRole("dialog");
  const parentMark = (await dialog.locator(".notebook-choice", { hasText: "仕事" }).locator(".dot, .notebook-icon").boundingBox())!;
  const childCheckbox = (await dialog.locator(".notebook-choice", { hasText: "議事録" }).locator("input").boundingBox())!;
  expect(Math.abs(childCheckbox.x - parentMark.x)).toBeLessThanOrEqual(1);
});

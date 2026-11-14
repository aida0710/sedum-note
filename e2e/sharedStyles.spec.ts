// 画面のあちこちで使う部品の見た目が、置き場所でばらばらにならないか。

import { expect, type Locator, test } from "@playwright/test";
import { createNoteOnDesktop, openSettingsPage, startLocalVault } from "./devices";

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

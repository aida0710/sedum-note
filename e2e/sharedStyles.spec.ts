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

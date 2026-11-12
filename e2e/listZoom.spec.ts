import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, startLocalVault } from "./devices";

const SCREENSHOT_DIRECTORY = process.env.SCREENSHOT_DIRECTORY;
const zoomBar = (page: Page) => page.getByRole("navigation", { name: "ズームしている項目までの道筋" });
// 画面に出ている本文の行。
const visibleLines = (page: Page) => page.locator(".ProseMirror p:visible");

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
  await page.locator(".ProseMirror p", { hasText: "駅前のホテル" }).click();
  await expect(page.locator(".ProseMirror p")).toHaveText(["はじめに", "旅行", "宿", "駅前のホテル", "持ち物", ""]);
}

test("箇条書きの項目にズームすると、その項目と子だけが出る。パンくずから上の階層と全体へ戻れる", async ({ page }) => {
  await writeNestedList(page);
  // カーソルのある「駅前のホテル」から、キーで 1 つ上の「宿」へ戻る形で確かめる。
  await page.keyboard.press("Control+.");
  await expect(visibleLines(page)).toHaveText(["駅前のホテル"]);
  await expect(zoomBar(page)).toHaveText("全体旅行宿駅前のホテル");
  await page.keyboard.press("Control+Shift+.");
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

test("メモのメニューからもズームできる。ズームしている項目を消すと、全体に戻る", async ({ page }) => {
  await writeNestedList(page);
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "この項目にズーム" }).click();
  await expect(visibleLines(page)).toHaveText(["駅前のホテル"]);

  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await expect(zoomBar(page)).toHaveCount(0);

  // 箇条書きの外にカーソルがあるときは、メニューにズームを出さない。
  await page.keyboard.type("ただの段落");
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await expect(page.getByRole("menuitem", { name: "ピン留め" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "この項目にズーム" })).toHaveCount(0);
});

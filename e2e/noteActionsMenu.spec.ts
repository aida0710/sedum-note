import { expect, type Locator, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, DESKTOP_VIEWPORT, PHONE_VIEWPORT, startLocalVault } from "./devices";

type MenuGroupView = { items: string[]; separatorWidth: string };

// 画面に出ているまとまり（.menu-group）ごとに、項目の名前（キーがあれば「名前 [キー]」）と、上の区切り線の太さを並べる。
function visibleMenuGroups(menu: Locator): Promise<MenuGroupView[]> {
  return menu.locator(".menu-group").evaluateAll((groups) => groups
    .filter((group) => getComputedStyle(group).display !== "none")
    .map((group) => ({
      items: [...group.querySelectorAll('[role^="menuitem"]')].map((item) => {
        const label = [...item.childNodes].filter((node) => node.nodeName !== "KBD").map((node) => node.textContent).join("").trim();
        const keys = item.querySelector("kbd")?.textContent;
        return keys ? `${label} [${keys}]` : label;
      }),
      separatorWidth: getComputedStyle(group).borderTopWidth,
    })));
}

async function expectInsideViewport(menu: Locator, viewport: { width: number; height: number }): Promise<void> {
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

const openNoteMenu = async (page: Page, scope: Locator = page.locator(".pane:not(.split-pane)")) => {
  await scope.getByRole("button", { name: "その他の操作" }).click();
  return page.getByRole("menu");
};

test("PC のメモの「…」は、まとまりごとに区切り線で分かれ、ショートカットのある項目にはキーが出る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "会議");
  // 箇条書きの中にカーソルを置くと、ズームの項目も出る。
  await page.keyboard.type("- 議題");
  const menu = await openNoteMenu(page);
  const groups = await visibleMenuGroups(menu);
  expect(groups.map((group) => group.items)).toEqual([
    ["ピン留め", "メモの期限を設定"],
    ["テンプレートにする", "複製", "ほかのメモを結合"],
    ["メモの中を検索 [Ctrl + F]", "この項目にズーム [Ctrl + .]", "すべて折りたたむ [Ctrl + Alt + []", "すべて開く [Ctrl + Alt + ]]"],
    ["右に並べて開く", "別のウィンドウで開く"],
    ["AI チャット [Ctrl + Alt + A]", "履歴"],
    ["書き出す", "印刷・PDF で保存"],
    ["ゴミ箱に入れる"],
  ]);
  // 線は、まとまりの間にだけ引く（先頭のまとまりの上には引かない）。
  expect(groups.map((group) => group.separatorWidth)).toEqual(["0px", "1px", "1px", "1px", "1px", "1px", "1px"]);
  // 本文の配置の選択肢は、表示のまとまりの中にある。
  await expect(menu.locator(".menu-group").nth(2).getByRole("group", { name: "本文の配置" })).toBeVisible();
  await expectInsideViewport(menu, DESKTOP_VIEWPORT);

  // 出しているキーで、同じことができる。
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+f");
  await expect(page.getByRole("search")).toBeVisible();
});

test("ゴミ箱の中のメモでは、項目の無くなったまとまりごと消え、区切り線が続かない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "古いメモ");
  await (await openNoteMenu(page)).getByRole("menuitem", { name: "ゴミ箱に入れる" }).click();
  // ゴミ箱に入れても、開いているタブはそのまま（ゴミ箱の中のメモとして出る）。
  await expect(page.locator(".trash-banner")).toBeVisible();
  const groups = await visibleMenuGroups(await openNoteMenu(page));
  expect(groups.map((group) => group.items)).toEqual([
    ["ピン留め"],
    ["テンプレートにする", "複製"],
    ["メモの中を検索 [Ctrl + F]"],
    ["右に並べて開く", "別のウィンドウで開く"],
    ["AI チャット [Ctrl + Alt + A]", "履歴"],
    ["書き出す", "印刷・PDF で保存"],
    ["ゴミ箱に入れる"],
  ]);
  expect(groups.map((group) => group.separatorWidth)).toEqual(["0px", "1px", "1px", "1px", "1px", "1px", "1px"]);
});

test("右に並べたメモの「…」では、Ctrl+F のキーを出さない（Ctrl+F は左のメモの中を探す）", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "資料");
  await (await openNoteMenu(page)).getByRole("menuitem", { name: "右に並べて開く" }).click();
  const splitPane = page.getByRole("region", { name: "右に並べたメモ" });
  const menu = await openNoteMenu(page, splitPane);
  await expect(menu.getByRole("menuitem", { name: "メモの中を検索" })).not.toContainText("Ctrl");
  await expect(menu.getByRole("menuitem", { name: "AI チャット" })).toContainText("Ctrl + Alt + A");
});

test("スマホ（390px）のメモの「…」は画面の中に収まり、キーボードのショートカットのキーは出さない", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(page);
  await page.locator(".fab").click();
  await page.getByPlaceholder("タイトル").fill("買い物");
  await page.getByPlaceholder("タイトル").press("Enter");
  await page.keyboard.type("- 牛乳");
  const menu = await openNoteMenu(page, page.locator(".phone-top"));
  const groups = await visibleMenuGroups(menu);
  expect(groups.map((group) => group.items)).toEqual([
    ["ピン留め", "メモの期限を設定"],
    ["テンプレートにする", "複製", "ほかのメモを結合"],
    ["メモの中を検索", "この項目にズーム", "すべて折りたたむ", "すべて開く"],
    ["AI チャット", "履歴"],
    ["書き出す", "印刷・PDF で保存"],
    ["ゴミ箱に入れる"],
  ]);
  await expect(menu.locator("kbd")).toHaveCount(0);
  await expectInsideViewport(menu, PHONE_VIEWPORT);

  // 書き出しのダイアログも、390px の幅に収まる。
  await menu.getByRole("menuitem", { name: "書き出す" }).click();
  const dialog = page.getByRole("dialog", { name: "メモを書き出す" });
  await expect(dialog.getByRole("radio", { name: "Markdown" })).toHaveAttribute("aria-checked", "true");
  await expectInsideViewport(dialog, PHONE_VIEWPORT);
});

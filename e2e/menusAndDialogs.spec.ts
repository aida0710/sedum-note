import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, PHONE_VIEWPORT, startLocalVault } from "./devices";

const noteMenuButton = (page: Page) => page.locator(".pane:not(.split-pane)").getByRole("button", { name: "その他の操作" });

test("メニューは開くとフォーカスを受け、↑↓・Home・End で項目を選べて、Escape で開いたボタンへ戻る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "会議");
  await noteMenuButton(page).focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "ピン留め" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: "ゴミ箱に入れる" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "ピン留め" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(menu.getByRole("menuitem", { name: "ゴミ箱に入れる" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(menu.getByRole("menuitem", { name: "ピン留め" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(noteMenuButton(page)).toBeFocused();
});

test("メニューで Tab を押すと閉じて、開いたボタンへ戻る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "会議");
  await noteMenuButton(page).click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(noteMenuButton(page)).toBeFocused();
});

test("低いウィンドウでも、メニューは画面に収まり、中を送って最後の項目を押せる", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  await startLocalVault(page);
  await createNoteOnDesktop(page, "会議");
  await noteMenuButton(page).click();
  const menu = page.getByRole("menu");
  const box = (await menu.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(480);
  // 中身は枠より長い（送れる）。
  expect(await menu.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await menu.getByRole("menuitem", { name: "ゴミ箱に入れる" }).click();
  await expect(page.locator(".trash-banner")).toBeVisible();
});

test("メニューの項目から開いたダイアログを閉じると、メニューを開いたボタンへフォーカスが戻る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "会議");
  await noteMenuButton(page).click();
  await page.getByRole("menuitem", { name: "履歴" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(noteMenuButton(page)).toBeFocused();
});

test("ダイアログの中で Tab を押し続けても、フォーカスはダイアログの外へ出ない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "会議");
  await noteMenuButton(page).click();
  await page.getByRole("menuitem", { name: "履歴" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const isFocusInsideDialog = () => dialog.evaluate((element) => element.contains(document.activeElement));
  for (let press = 0; press < 6; press += 1) {
    await page.keyboard.press("Tab");
    expect(await isFocusInsideDialog()).toBe(true);
  }
  for (let press = 0; press < 6; press += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(await isFocusInsideDialog()).toBe(true);
  }
  // 外へ出ていないので、Escape で閉じられる。
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("戻せない操作の確認は「キャンセル」にフォーカスがあり、押したままの Enter では決まらない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "古いメモ");
  await noteMenuButton(page).click();
  await page.getByRole("menuitem", { name: "ゴミ箱に入れる" }).click();
  const removeButton = page.locator(".trash-banner").getByRole("button", { name: "完全に削除" });
  await removeButton.focus();

  // Enter を押したままにする: 1 回目で確認が開き、続きはキーの繰り返しとして届く。
  await page.keyboard.down("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "キャンセル" })).toBeFocused();
  await page.keyboard.down("Enter");
  await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  // 繰り返しの Enter では、決まりも閉じもしない。
  await expect(dialog).toBeVisible();
  await expect(page.locator(".trash-banner")).toBeVisible();

  // 押し直した Enter は「キャンセル」を押す。メモは残る。
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".trash-banner")).toBeVisible();
});

test("続けてゴミ箱に入れると、知らせは 1 つにまとまり、「元に戻す」で全部戻る", async ({ page }) => {
  await startLocalVault(page);
  for (const title of ["一つ目", "二つ目", "三つ目"]) {
    await createNoteOnDesktop(page, title);
    await noteMenuButton(page).click();
    await page.getByRole("menuitem", { name: "ゴミ箱に入れる" }).click();
    await expect(page.locator(".trash-banner")).toBeVisible();
  }
  const toast = page.getByRole("status").filter({ hasText: "3 件のメモをゴミ箱に入れました" });
  await toast.getByRole("button", { name: "元に戻す" }).click();
  await expect(page.locator(".trash-banner")).toBeHidden();
  const trashCount = page.locator(".sidebar .nav").filter({ hasText: "ゴミ箱" }).locator(".count");
  await expect(trashCount).toHaveCount(0);
});

test("知らせは、ポインターを乗せている間は消えない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "会議");
  await noteMenuButton(page).click();
  await page.getByRole("menuitem", { name: "ゴミ箱に入れる" }).click();
  const toast = page.getByRole("status").filter({ hasText: "ゴミ箱に入れました" });
  await toast.hover();
  // 知らせを出しておく時間（6 秒）より長く待つ。
  await page.waitForTimeout(7_000);
  await expect(toast).toBeVisible();
});

test("ダイアログの戻せない操作のボタン（期限を外す）は、決めるボタンから離して左端に置く", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "提出物");
  for (const step of ["set", "reopen"]) {
    await noteMenuButton(page).click();
    await page.getByRole("menuitem", { name: "メモの期限を設定" }).click();
    if (step === "set") {
      const dialog = page.getByRole("dialog", { name: "メモの期限" });
      await dialog.getByLabel("日時").fill("2030-01-01T09:00");
      await dialog.getByRole("button", { name: "保存" }).click();
    }
  }
  const dialog = page.getByRole("dialog", { name: "メモの期限" });
  const dateField = (await dialog.getByLabel("日時").boundingBox())!;
  const remove = (await dialog.getByRole("button", { name: "期限を外す" }).boundingBox())!;
  const cancel = (await dialog.getByRole("button", { name: "キャンセル" }).boundingBox())!;
  expect(remove.x).toBeCloseTo(dateField.x, 0);
  expect(cancel.x - (remove.x + remove.width)).toBeGreaterThan(40);
});

test("PC では、知らせは左の列を除いた本文の欄の中央に出る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "会議");
  await noteMenuButton(page).click();
  await page.getByRole("menuitem", { name: "ゴミ箱に入れる" }).click();
  const toast = (await page.getByRole("status").filter({ hasText: "ゴミ箱に入れました" }).boundingBox())!;
  const pane = (await page.locator(".main").boundingBox())!;
  expect(Math.abs((toast.x + toast.width / 2) - (pane.x + pane.width / 2))).toBeLessThanOrEqual(1);
});

test.describe("スマホの幅", () => {
  test.use({ viewport: PHONE_VIEWPORT, hasTouch: true });

  test("ゴミ箱に入れた知らせは 1 行に収まる", async ({ page }) => {
    await startLocalVault(page);
    await page.locator(".fab").click();
    await page.getByPlaceholder("タイトル").fill("買い物");
    await page.getByRole("button", { name: "その他の操作" }).click();
    await page.getByRole("menuitem", { name: "ゴミ箱に入れる" }).click();
    const toast = page.getByRole("status").filter({ hasText: "ゴミ箱に入れました" });
    await expect(toast).toBeVisible();
    const lineCounts = await toast.evaluate((element) => [...element.children].map((child) => child.getClientRects().length));
    expect(lineCounts).toEqual([1, 1]);
    const box = (await toast.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE_VIEWPORT.width);
  });
});

test("履歴の一覧は ↑↓・Home・End で版を移れ、移った版の中身が右に出る。Tab で止まるのは選んでいる版だけ", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-11T09:00:00+09:00") });
  await startLocalVault(page);
  await createNoteOnDesktop(page, "議事録");
  // 間隔（10 分）を空けて書き直すたびに、書き直す前の状態が履歴に残る。
  for (const text of ["一回目の文", "二回目の文", "三回目の文"]) {
    await page.locator(".ProseMirror").click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type(text);
    await page.clock.runFor(1_000);
    await page.clock.runFor(11 * 60_000);
  }
  await noteMenuButton(page).click();
  await page.getByRole("menuitem", { name: "履歴" }).click();
  const history = page.getByRole("dialog", { name: "履歴" });
  const options = history.getByRole("option");
  await expect(options).toHaveCount(2);
  await expect(options.first()).toHaveAttribute("tabindex", "0");
  await expect(options.last()).toHaveAttribute("tabindex", "-1");

  await options.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(options.last()).toBeFocused();
  await expect(options.last()).toHaveAttribute("aria-selected", "true");
  await expect(history.locator(".note-history-preview")).toContainText("一回目の文");
  await page.keyboard.press("Home");
  await expect(options.first()).toBeFocused();
  await expect(history.locator(".note-history-preview")).toContainText("二回目の文");
});

test("メニューでは、項目の名前の頭の文字を打つとその項目へ移り、開いたボタンは開いている間 aria-expanded になる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "会議");
  await expect(noteMenuButton(page)).not.toHaveAttribute("aria-expanded", "true");
  await noteMenuButton(page).focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(noteMenuButton(page)).toHaveAttribute("aria-expanded", "true");
  // 「a」を打つと、「AI チャット」へ移る（大文字と小文字は区別しない）。
  await page.keyboard.press("a");
  await expect(menu.getByRole("menuitem", { name: "AI チャット" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(noteMenuButton(page)).toHaveAttribute("aria-expanded", "false");
});

test("本文の選択を保つメニュー（文字色）は、フォーカスを本文に置いたまま ↑↓ で項目を選び、Enter で決められる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "会議");
  await page.keyboard.type("色を付ける言葉");
  await page.keyboard.press("Shift+Home");
  await page.getByRole("button", { name: "文字色" }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(page.locator(".ProseMirror")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  const active = menu.locator(".active-descendant");
  await expect(active).toHaveCount(1);
  const activeId = await active.getAttribute("id");
  await expect(page.locator(".ProseMirror")).toHaveAttribute("aria-activedescendant", activeId ?? "");
  const colorName = await active.getAttribute("aria-label");
  await page.keyboard.press("Enter");
  await expect(page.locator(".ProseMirror [data-text-color]")).toHaveText("色を付ける言葉");
  expect(colorName).not.toBeNull();
});

import { expect, type Locator, type Page, test } from "@playwright/test";
import { newTestRemoteConfig } from "../integration/testStorage";
import { createNoteOnDesktop, openSyncedDevice, PHONE_VIEWPORT, startLocalVault, syncNowOnDesktop } from "./devices";

// スマホの一覧で、メモを作って一覧へ戻る。
async function createNoteOnPhone(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill(title);
  await page.getByRole("button", { name: "戻る" }).click();
}

// 行の真ん中を押さえて、横へ distance だけ動かして離す（左へは負）。
async function swipe(page: Page, item: Locator, distance: number): Promise<void> {
  const box = (await item.boundingBox())!;
  const y = box.y + box.height / 2;
  const startX = box.x + box.width / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + distance, y, { steps: 10 });
  await page.mouse.up();
}

test("スマホの一覧でメモを右へ払うとピン留めし、左へ払うとゴミ箱に入れる。少し動かしただけでは何もせず、押すと開く", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(page);
  await createNoteOnPhone(page, "買い物");
  await createNoteOnPhone(page, "旅行");
  const item = (title: string) => page.locator(".note-item", { hasText: title });

  // 少し動かしただけでは、何もせず、メモも開かない。
  await swipe(page, item("買い物"), 16);
  await expect(item("買い物").locator(".pin")).toHaveCount(0);
  await expect(page.getByPlaceholder("タイトル")).toHaveCount(0);

  await swipe(page, item("買い物"), 220);
  await expect(item("買い物").locator(".pin")).toBeVisible();
  await expect(page.getByPlaceholder("タイトル")).toHaveCount(0);

  await swipe(page, item("旅行"), -260);
  await expect(item("旅行")).toHaveCount(0);
  const toast = page.getByRole("status").filter({ hasText: "ゴミ箱に移動しました" });
  await toast.getByRole("button", { name: "元に戻す" }).click();
  await expect(item("旅行")).toBeVisible();

  await item("買い物").click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("買い物");
});

test("指で横に払ってもピン留めでき、縦に動かしたときは払わない", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "タッチの操作を CDP で送るので、Chromium だけで確かめる");
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT, hasTouch: true })).newPage();
  await startLocalVault(page);
  await createNoteOnPhone(page, "買い物");
  const item = page.locator(".note-item", { hasText: "買い物" });
  const box = (await item.boundingBox())!;
  const y = box.y + box.height / 2;
  const x = box.x + box.width / 2;
  const cdp = await page.context().newCDPSession(page);
  // 指を from から to まで動かして離す。
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
    for (let step = 1; step <= 10; step += 1) {
      const point = { x: from.x + ((to.x - from.x) * step) / 10, y: from.y + ((to.y - from.y) * step) / 10 };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };

  await drag({ x, y }, { x: x + 10, y: y + 120 });
  await expect(item.locator(".pin")).toHaveCount(0);
  await expect(page.getByPlaceholder("タイトル")).toHaveCount(0);

  await drag({ x: x - 100, y }, { x: x + 120, y });
  await expect(item.locator(".pin")).toBeVisible();
  await expect(page.getByPlaceholder("タイトル")).toHaveCount(0);
});

test("同期先があれば、スマホの一覧を上から引いて離すと同期する", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "タッチの操作を CDP で送るので、Chromium だけで確かめる");
  const remoteConfig = await newTestRemoteConfig();
  const laptop = await openSyncedDevice(browser, { remoteConfig, join: false });
  const phone = await openSyncedDevice(browser, { remoteConfig, join: true, viewport: PHONE_VIEWPORT, hasTouch: true });
  // スマホの自動の同期を切り、引いたときだけ同期するようにする。
  const tabbar = phone.locator(".tabbar");
  await tabbar.getByRole("button", { name: "設定" }).click();
  await phone.getByRole("navigation", { name: "設定のページ" }).getByRole("button", { name: /同期/ }).click();
  await phone.getByLabel("自動で同期する").uncheck();
  await tabbar.getByRole("button", { name: "メモ" }).click();

  await createNoteOnDesktop(laptop, "引いて届いたメモ");
  await syncNowOnDesktop(laptop, "引いて届いたメモ");
  const arrived = phone.locator(".note-item", { hasText: "引いて届いたメモ" });
  // 自動なら 2 秒ほどで届く。それより長く待っても届かない。
  await phone.waitForTimeout(4_000);
  await expect(arrived).toHaveCount(0);

  const cdp = await phone.context().newCDPSession(phone);
  const list = (await phone.locator(".phone-scroll").boundingBox())!;
  const x = list.x + list.width / 2;
  const touchAt = (type: "touchStart" | "touchMove", y: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: [{ x, y }] });
  await touchAt("touchStart", list.y + 20);
  for (let step = 1; step <= 10; step += 1) {
    await touchAt("touchMove", list.y + 20 + step * 18);
  }
  await expect(phone.locator(".pull-to-sync")).toContainText("離して同期");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(arrived).toBeVisible({ timeout: 20_000 });
  await expect(phone.locator(".pull-to-sync")).toHaveAttribute("data-state", "idle");

  // 同期先につながらないときに引くと、失敗したことを知らせる。
  await phone.route(`${remoteConfig.endpoint}/**`, (route) => route.abort());
  await touchAt("touchStart", list.y + 20);
  for (let step = 1; step <= 10; step += 1) {
    await touchAt("touchMove", list.y + 20 + step * 18);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const failureToast = phone.getByRole("status").filter({ hasText: "同期に失敗しました" });
  await expect(failureToast).toBeVisible({ timeout: 20_000 });
  // 一覧の題の右にも、同期の状態が出る（自動の同期を切っているので、やり直さずに止まる）。
  await expect(phone.locator(".phone-top .sync-line")).toContainText("同期を停止しています");
  // 知らせのボタンから、失敗の理由が出ている設定の「同期」のページへ移れる。
  await failureToast.getByRole("button", { name: "同期の設定を開く" }).click();
  await expect(phone.getByRole("heading", { name: "同期", exact: true })).toBeVisible();
});

test("スマホの一覧の行と上のチップに、ノートブックの色の印が出る", async ({ page }) => {
  await startLocalVault(page);
  await page.getByRole("button", { name: "ノートブックを追加" }).click();
  await page.getByPlaceholder("ノートブックの名前").fill("旅行");
  await page.getByPlaceholder("ノートブックの名前").press("Enter");
  await page.getByRole("button", { name: /^旅行/ }).click();
  await createNoteOnDesktop(page, "沖縄の持ち物");
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.getByRole("button", { name: "戻る" }).click();
  const notebookOfItem = page.locator(".note-item", { hasText: "沖縄の持ち物" }).locator(".meta-notebook");
  await expect(notebookOfItem).toHaveText("旅行");
  await expect(notebookOfItem.locator(".dot")).toBeVisible();
  await expect(page.locator(".chips .chip", { hasText: "旅行" }).locator(".dot")).toBeVisible();
});

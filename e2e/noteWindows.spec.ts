import { expect, type Page, test } from "@playwright/test";
import { newTestRemoteConfig } from "../integration/testStorage";
import { createNoteOnDesktop, openSyncedDevice, PASSPHRASE, placeCursorAtBodyEnd, startLocalVault, startSyncedVault, syncNowOnDesktop } from "./devices";

async function unlock(page: Page): Promise<void> {
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "解除" }).click();
}

test("同じメモを 2 つのタブで開いて書いても、どちらの文字も両方に出て、開き直しても残る", async ({ page, context }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "議事録");
  await page.keyboard.type("1 つ目のタブの行");

  const secondTab = await context.newPage();
  await secondTab.goto("/");
  await unlock(secondTab);
  await secondTab.locator(".tree-note", { hasText: "議事録" }).first().click();
  await expect(secondTab.locator(".ProseMirror")).toHaveText("1 つ目のタブの行");
  await placeCursorAtBodyEnd(secondTab);
  await secondTab.keyboard.press("Enter");
  await secondTab.keyboard.type("2 つ目のタブの行");
  await expect(page.locator(".ProseMirror p")).toHaveText(["1 つ目のタブの行", "2 つ目のタブの行"]);

  // 1 つ目のタブで続けて書いても、2 つ目のタブの行は消えない。
  await placeCursorAtBodyEnd(page);
  await page.keyboard.type("（追記）");
  await expect(secondTab.locator(".ProseMirror p")).toHaveText(["1 つ目のタブの行", "2 つ目のタブの行（追記）"]);
  await page.reload();
  await unlock(page);
  await page.locator(".tree-note", { hasText: "議事録" }).first().click();
  await expect(page.locator(".ProseMirror p")).toHaveText(["1 つ目のタブの行", "2 つ目のタブの行（追記）"]);
});

test("メモを別のウィンドウで開くと、ロックの解除のあと、そのメモだけが出る。書いた文字は元のウィンドウにも出る", async ({ page, context }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  await page.keyboard.type("牛乳");
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  const opened = context.waitForEvent("page");
  await page.getByRole("menuitem", { name: "別のウィンドウで開く" }).click();
  const noteWindow = await opened;

  await unlock(noteWindow);
  await expect(noteWindow.getByPlaceholder("タイトル")).toHaveValue("買い物");
  await expect(noteWindow.locator(".ProseMirror")).toHaveText("牛乳");
  await expect(noteWindow.locator(".sidebar")).toBeHidden();
  await expect(noteWindow.getByRole("tablist")).toBeHidden();
  await expect(noteWindow).toHaveTitle("買い物");

  await placeCursorAtBodyEnd(noteWindow);
  await noteWindow.keyboard.type("と卵");
  await expect(page.locator(".ProseMirror")).toHaveText("牛乳と卵");
});

test("同期は片方のタブだけが行い、もう片方のタブで書いた文字も、ほかのデバイスへ届く", async ({ page, context, browser }) => {
  const remoteConfig = await newTestRemoteConfig();
  await startSyncedVault(page, { remoteConfig, join: false });
  await createNoteOnDesktop(page, "共有メモ");
  await page.keyboard.type("1 つ目のタブ");

  const secondTab = await context.newPage();
  await secondTab.goto("/");
  await unlock(secondTab);
  await expect(secondTab.locator(".sync-line")).toHaveText("別のウィンドウが同期しています");
  await secondTab.locator(".tree-note", { hasText: "共有メモ" }).first().click();
  await placeCursorAtBodyEnd(secondTab);
  await secondTab.keyboard.type("と 2 つ目のタブ");
  await expect(secondTab.locator(".ProseMirror")).toHaveText("1 つ目のタブと 2 つ目のタブ");
  // 2 つ目のタブの文字が 1 つ目のタブに届いたら、1 つ目のタブ（同期の受け持ち）から送る。
  await expect(page.locator(".ProseMirror")).toHaveText("1 つ目のタブと 2 つ目のタブ");
  await syncNowOnDesktop(page, "共有メモ");

  const otherDevice = await openSyncedDevice(browser, { remoteConfig, join: true });
  await otherDevice.locator(".tree-note", { hasText: "共有メモ" }).first().click();
  await expect(otherDevice.locator(".ProseMirror")).toHaveText("1 つ目のタブと 2 つ目のタブ");

  // 同期していたタブを閉じると、残ったタブが同期を引き継ぐ。
  await page.close();
  await expect(secondTab.locator(".sync-line")).not.toHaveText("別のウィンドウが同期しています");
});

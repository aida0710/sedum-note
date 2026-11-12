import { expect, type Page, test } from "@playwright/test";
import { newTestRemoteConfig } from "../integration/testStorage";
import { createNoteOnDesktop, openSyncedDevice, startLocalVault, syncNowOnDesktop } from "./devices";

// 本文に直接置いた埋め込み（埋め込みの中の埋め込みを除く）。
const embed = (page: Page) => page.locator(".block-embed").first();

// 「/」から、メモ noteTitle の中のブロック blockText の埋め込みを、カーソルの所に入れる。
async function embedBlock(page: Page, noteTitle: string, blockText: string): Promise<void> {
  await page.keyboard.type("/うめこみ");
  await page.getByRole("listbox", { name: "ブロックの種類" }).getByRole("option", { name: "ブロックの埋め込み（ほかのメモの一部を出す）" }).click();
  await page.getByRole("dialog", { name: "ブロックのあるメモを選ぶ" }).getByRole("button", { name: noteTitle }).click();
  await page.getByRole("dialog", { name: `「${noteTitle}」の中のブロックを選ぶ` }).getByRole("button", { name: blockText }).click();
}

test("ブロックの埋め込みは、元のブロックの中身を出す。元を書き換えると表示も変わり、元を消すとその旨を出す", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "計画");
  await page.keyboard.type("出発は朝");
  await page.keyboard.press("Enter");
  await page.keyboard.type("宿は駅前");
  await createNoteOnDesktop(page, "メモ");
  await embedBlock(page, "計画", "宿は駅前");
  await expect(embed(page).locator(".ProseMirror")).toHaveText("宿は駅前");

  // 埋め込みの上の題を押すと、元のメモを開いて、そのブロックまで送る。カーソルはブロックの先頭にある。
  await embed(page).getByRole("button", { name: "計画" }).click();
  await expect(page.locator(".ProseMirror .revealed-block")).toHaveText("宿は駅前");
  await page.keyboard.type("今夜の");
  await page.getByRole("tab", { name: "メモ" }).click();
  await expect(embed(page).locator(".ProseMirror")).toHaveText("今夜の宿は駅前");
  // 埋め込んだメモには、バックリンクが出る。
  await page.getByRole("tab", { name: "計画" }).click();
  await expect(page.getByRole("region", { name: "このメモへのリンク" }).getByRole("button", { name: "メモ" })).toBeVisible();

  await page.locator(".ProseMirror").first().click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await page.keyboard.type("書き直した");
  await page.getByRole("tab", { name: "メモ" }).click();
  await expect(embed(page)).toContainText("計画（ブロックが削除されました）");
});

test("同じメモの中のブロックも埋め込める。元を打つそばから、埋め込みの表示が変わる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "議事録");
  await page.keyboard.type("決定: 来週に延期");
  await page.keyboard.press("Enter");
  await embedBlock(page, "議事録", "決定: 来週に延期");
  await expect(embed(page).locator(".ProseMirror")).toHaveText("決定: 来週に延期");
  await page.locator(".ProseMirror p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type("（確定）");
  await expect(embed(page).locator(".ProseMirror")).toHaveText("決定: 来週に延期（確定）");
});

test("自分を含むブロックを埋め込んでも、決めた段数で止まる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "入れ子");
  await page.keyboard.type("- 親");
  await page.keyboard.press("Enter");
  // 「親」の項目の中（子の項目）に、「親」の項目そのものの埋め込みを入れる。
  await page.keyboard.press("Tab");
  await embedBlock(page, "入れ子", "親");
  await expect(page.locator(".block-embed").filter({ hasText: "埋め込みが深すぎるので、ここから先は出しません" }).first()).toBeVisible();
  await expect(page.locator(".block-embed")).toHaveCount(4);
});

test("ほかのデバイスが元のブロックを書き換えると、同期で届いたときに、開いたままの埋め込みの表示が変わる", async ({ browser }) => {
  const remoteConfig = await newTestRemoteConfig();
  const writer = await openSyncedDevice(browser, { remoteConfig, join: false });
  await createNoteOnDesktop(writer, "計画");
  await writer.keyboard.type("宿は駅前");
  await createNoteOnDesktop(writer, "メモ");
  await embedBlock(writer, "計画", "宿は駅前");
  await expect(embed(writer).locator(".ProseMirror")).toHaveText("宿は駅前");
  await syncNowOnDesktop(writer, "メモ");

  const reader = await openSyncedDevice(browser, { remoteConfig, join: true });
  await reader.getByRole("button", { name: "メモ", exact: true }).click();
  await expect(embed(reader).locator(".ProseMirror")).toHaveText("宿は駅前");

  await writer.getByRole("tab", { name: "計画" }).click();
  await writer.locator(".ProseMirror").first().click();
  await writer.keyboard.press("Control+End");
  await writer.keyboard.type("のホテル");
  await syncNowOnDesktop(writer, "計画");
  await syncNowOnDesktop(reader, "メモ");
  await expect(embed(reader).locator(".ProseMirror")).toHaveText("宿は駅前のホテル");
});

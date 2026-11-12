import { expect, type Page, test } from "@playwright/test";
import { openSettingsPage, selectSettingsPage, startLocalVault } from "./devices";

async function startLocalVaultWithNote(page: Page, title: string): Promise<void> {
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill(title);
}

async function storedRecordCount(page: Page): Promise<number> {
  return page.evaluate(() => new Promise<number>((resolve, reject) => {
    const opening = indexedDB.open("sedum-note");
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      if (!database.objectStoreNames.contains("records")) {
        database.close();
        resolve(0);
        return;
      }
      const counting = database.transaction("records").objectStore("records").count();
      counting.onsuccess = () => { database.close(); resolve(counting.result); };
    };
  }));
}

test("設定からこのデバイスのデータを消すと、入力の直後でも何も残らず、最初の画面に戻る", async ({ page }) => {
  await startLocalVaultWithNote(page, "消すメモ");
  await openSettingsPage(page, "外観");
  await page.getByRole("radio", { name: "ミッドナイト" }).click();
  // 保存（0.15 秒後）を待たせた入力を残したまま消す。
  await page.getByRole("tab", { name: "消すメモ" }).click();
  await page.getByPlaceholder("タイトル").fill("消す直前に打った");
  await page.getByRole("tab", { name: "設定" }).click();
  await selectSettingsPage(page, "セキュリティ");
  await page.getByRole("button", { name: "このデバイスのデータを消す" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("1 件のメモとノートブックは、バックアップが無ければ元に戻せません");
  await dialog.getByRole("button", { name: "すべて消す" }).click();

  await expect(page.getByRole("heading", { name: "メモを始める" })).toBeVisible();
  await page.waitForTimeout(500);
  expect(await storedRecordCount(page)).toBe(0);
  // 表示の設定も消えて、テーマが既定（ライト）に戻る。
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim())).toBe("#f7f7f5");
});

test("パスフレーズを忘れても、ロック解除の画面からデータを消して始め直せる", async ({ page }) => {
  await startLocalVaultWithNote(page, "読めなくなるメモ");
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByText("パスフレーズを忘れたとき").click();
  await page.getByRole("button", { name: "このデバイスのデータを消す" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByRole("heading", { name: "ロックを解除" })).toBeVisible();

  await page.getByRole("button", { name: "このデバイスのデータを消す" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "すべて消す" }).click();
  await expect(page.getByRole("heading", { name: "メモを始める" })).toBeVisible();
  expect(await storedRecordCount(page)).toBe(0);
});

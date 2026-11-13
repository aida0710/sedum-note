// PC の画面の並び（開いているタブ、ピン留め、選んでいるタブ、左の列の開け閉め）が、ロックと再読み込みのあとに戻ること。

import { expect, type Page, test } from "@playwright/test";
import { addNotebookOnDesktop, createNoteOnDesktop, PASSPHRASE, startLocalVault } from "./devices";

async function unlockApp(page: Page): Promise<void> {
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "解除" }).click();
}

// ブラウザの平文の保存（localStorage と sessionStorage）とアドレス。
function plainStorageOf(page: Page): Promise<string> {
  return page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }, location.href]));
}

async function openThreeNotesAndPinOne(page: Page): Promise<void> {
  for (const title of ["一", "二", "三"]) {
    await createNoteOnDesktop(page, title);
  }
  await page.getByRole("tab", { name: "三" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "タブをピン留め" }).click();
  await page.getByRole("tab", { name: "二" }).click();
}

async function expectThreeNotesWithOnePinned(page: Page): Promise<void> {
  await expect(page.getByRole("tab")).toHaveText([/三/, /一/, /二/]);
  await expect(page.getByRole("tab", { name: "三" }).getByRole("button", { name: "タブを閉じる" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "二" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("二");
}

test("ロックして解除すると、開いていたタブ・ピン留め・選んでいたタブ・左の列の開け閉めが戻る", async ({ page }) => {
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "仕事");
  await openThreeNotesAndPinOne(page);
  // 既定では閉じているゴミ箱を開き、既定では開いているノートブックを閉じる。
  const trashRow = page.locator('.sidebar [data-view-key="trash"]');
  const notebookRow = page.getByRole("button", { name: /^仕事/ });
  await trashRow.click();
  await notebookRow.click();
  await notebookRow.click();
  await expect(trashRow).toHaveAttribute("aria-expanded", "true");
  await expect(notebookRow).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("Control+l");
  await expect(page.getByRole("heading", { name: "ロックを解除" })).toBeVisible();
  await unlockApp(page);

  await expectThreeNotesWithOnePinned(page);
  await expect(trashRow).toHaveAttribute("aria-expanded", "true");
  await expect(notebookRow).toHaveAttribute("aria-expanded", "false");
});

test("読み込み直して解除しても、開いていたタブが戻る。タブの並びは、ブラウザの平文の保存にもアドレスにも書かない", async ({ page }) => {
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).waitFor();
  const plainStorageBefore = await plainStorageOf(page);
  await openThreeNotesAndPinOne(page);
  expect(await plainStorageOf(page)).toBe(plainStorageBefore);

  await page.reload();
  await unlockApp(page);
  await expectThreeNotesWithOnePinned(page);
});

test("完全に削除したメモのタブは、読み込み直したあとに戻さない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "残すメモ");
  await createNoteOnDesktop(page, "消すメモ");
  const noteRow = page.locator(".sidebar .tree-note", { hasText: "消すメモ" });
  await noteRow.hover();
  await page.getByRole("button", { name: "「消すメモ」の操作" }).click();
  await page.getByRole("menuitem", { name: "ゴミ箱に入れる" }).click();
  await page.locator('.sidebar [data-view-key="trash"]').click();
  await noteRow.hover();
  await page.getByRole("button", { name: "「消すメモ」の操作" }).click();
  await page.getByRole("menuitem", { name: "完全に削除" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "完全に削除" }).click();
  await expect(page.getByRole("button", { name: "「消すメモ」の操作" })).toHaveCount(0);

  await page.reload();
  await unlockApp(page);
  await expect(page.getByRole("tab")).toHaveText([/残すメモ/]);
});

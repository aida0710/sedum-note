import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

const PASSPHRASE = "correct horse battery";

async function startLocalVault(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
  await page.getByRole("button", { name: "作成" }).click();
  await page.getByRole("button", { name: "新しいメモ" }).click();
}

test("同期を設定しなくても、パスフレーズだけで始めてメモを書ける", async ({ page }) => {
  await startLocalVault(page);
  await page.getByPlaceholder("タイトル").fill("ローカルだけのメモ");
  await expect(page.getByText("同期は未設定")).toBeVisible();
  // 入力は 0.15 秒後に手元へ保存される。それより長く待ってから閉じる。
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByLabel("パスフレーズ").fill(PASSPHRASE);
  await page.getByRole("button", { name: "解除" }).click();
  // ノートブックが無いうちは「すべてのメモ」が最初から開いている。
  await expect(page.getByRole("button", { name: "ローカルだけのメモ" })).toBeVisible();
});

test("写真以外のファイルを添付でき、保存すると同じ中身のファイルが得られる", async ({ page }) => {
  await startLocalVault(page);
  await page.getByPlaceholder("タイトル").fill("資料つき");
  await page.getByPlaceholder("タイトル").press("Enter");
  const contents = Buffer.from("%PDF-1.7 これは試験用の資料です\n".repeat(200));
  await page.locator('input[type="file"]:not([accept])').setInputFiles({ name: "見積書.pdf", mimeType: "application/pdf", buffer: contents });
  const fileNode = page.locator(".attachment-file");
  await expect(fileNode).toContainText("見積書.pdf");
  await expect(fileNode).toContainText("KB");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "見積書.pdf を保存" }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe("見積書.pdf");
  expect(await readFile(await saved.path())).toEqual(contents);
});

test("バックアップを書き出し、別のデバイスの最初の画面から戻せる", async ({ browser }) => {
  const source = await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage();
  await startLocalVault(source);
  await source.getByPlaceholder("タイトル").fill("バックアップするメモ");
  await source.getByPlaceholder("タイトル").press("Enter");
  await source.keyboard.type("戻ってくる本文");
  await source.locator('input[type="file"]:not([accept])').setInputFiles({ name: "memo.txt", mimeType: "text/plain", buffer: Buffer.from("添付の中身") });
  await expect(source.locator(".attachment-file")).toContainText("memo.txt");

  await source.getByRole("button", { name: /同期は未設定/ }).click();
  const download = source.waitForEvent("download");
  await source.getByRole("button", { name: "バックアップを書き出す" }).click();
  const backup = await download;
  expect(backup.suggestedFilename()).toMatch(/^sedum-note-backup-\d{8}\.sedumbackup$/);
  await expect(source.getByText("1件のメモを書き出しました")).toBeVisible();
  const backupPath = await backup.path();
  expect((await readFile(backupPath)).toString("latin1")).not.toMatch(/memo\.txt/);

  const target = await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage();
  await target.goto("/");
  await target.getByRole("tab", { name: "バックアップから戻す" }).click();
  await target.getByLabel("バックアップのファイル").setInputFiles(backupPath);
  await target.getByLabel("パスフレーズ", { exact: true }).fill("a wrong passphrase");
  await target.getByRole("button", { name: "戻す" }).click();
  await expect(target.getByRole("alert")).toContainText("パスフレーズが違います");
  await target.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await target.getByRole("button", { name: "戻す" }).click();

  await target.getByRole("button", { name: "バックアップするメモ" }).click();
  await expect(target.locator(".ProseMirror")).toContainText("戻ってくる本文");
  const restoredFile = target.waitForEvent("download");
  await target.getByRole("button", { name: "memo.txt を保存" }).click();
  expect((await readFile(await (await restoredFile).path())).toString()).toBe("添付の中身");
});

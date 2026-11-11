import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, startLocalVault } from "./devices";

async function addNotebook(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "ノートブックを追加" }).click();
  await page.getByPlaceholder("ノートブックの名前").fill(name);
  await page.getByPlaceholder("ノートブックの名前").press("Enter");
}

function viewRow(page: Page, label: string) {
  return page.locator(".nav-row", { has: page.locator(".nav", { hasText: label }) });
}

function noteRow(page: Page, title: string) {
  return page.locator(".nav-row", { has: page.locator(".tree-note", { hasText: title }) });
}

test("メモをノートブックへドラッグすると、そのノートブックに入る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  await addNotebook(page, "旅行");
  await expect(viewRow(page, "旅行").locator(".count")).toHaveText("0");

  await viewRow(page, "すべてのメモ").locator(".nav").click();
  await noteRow(page, "買い物").locator(".tree-note").dragTo(viewRow(page, "旅行"));
  await expect(viewRow(page, "旅行").locator(".count")).toHaveText("1");
});

test("メモをゴミ箱へドラッグすると知らせが出て、「元に戻す」で戻せる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  const trashCount = viewRow(page, "ゴミ箱").locator(".count");

  await noteRow(page, "買い物").locator(".tree-note").dragTo(viewRow(page, "ゴミ箱"));
  await expect(trashCount).toHaveText("1");
  const toast = page.getByRole("status").filter({ hasText: "ゴミ箱に入れました" });
  await toast.getByRole("button", { name: "元に戻す" }).click();
  await expect(trashCount).toHaveText("0");
  await expect(toast).toBeHidden();
});

test("左の列のメモの「…」から、名前を変えたり、ゴミ箱に入れたりできる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");

  await noteRow(page, "買い物").hover();
  await page.getByRole("button", { name: "「買い物」の操作" }).click();
  await page.getByRole("menuitem", { name: "名前を変更" }).click();
  await page.locator(".sidebar .inline-input").fill("週末の買い物");
  await page.locator(".sidebar .inline-input").press("Enter");
  await expect(page.getByRole("tab", { name: "週末の買い物" })).toBeVisible();

  // 右クリックでも同じメニューが出る。
  await noteRow(page, "週末の買い物").click({ button: "right" });
  await page.getByRole("menuitem", { name: "ゴミ箱に入れる" }).click();
  await expect(viewRow(page, "ゴミ箱").locator(".count")).toHaveText("1");
  await expect(page.getByRole("status")).toContainText("ゴミ箱に入れました");
});

test("タブはドラッグで並べ替えられる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "一つ目");
  await createNoteOnDesktop(page, "二つ目");
  await expect(page.getByRole("tab")).toHaveText([/一つ目/, /二つ目/]);

  await page.getByRole("tab", { name: "二つ目" }).dragTo(page.getByRole("tab", { name: "一つ目" }));
  await expect(page.getByRole("tab")).toHaveText([/二つ目/, /一つ目/]);
});

test("左の列の端をドラッグすると幅が変わり、開き直しても保たれる", async ({ page }) => {
  await startLocalVault(page);
  const sidebar = page.locator(".sidebar");
  const handle = page.getByRole("separator", { name: "左の列の幅を変える" });
  const handleBox = (await handle.boundingBox())!;

  await page.mouse.move(handleBox.x + handleBox.width / 2, 300);
  await page.mouse.down();
  await page.mouse.move(400, 300, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(400);

  await page.reload();
  await page.getByLabel("パスフレーズ").fill("correct horse battery");
  await page.getByRole("button", { name: "解除" }).click();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(400);
});

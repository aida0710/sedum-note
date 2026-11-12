import { expect, type Page, test } from "@playwright/test";
import { newTestRemoteConfig } from "../integration/testStorage";
import { createNoteOnDesktop, fillSyncTarget, openSettingsPage, openSyncedDevice, PASSPHRASE, startLocalVault, startSyncedVault, SYNC_KEY, syncNowOnDesktop } from "./devices";

const spaceSwitcher = (page: Page) => page.getByRole("button", { name: /スペースを切り替える/ });
const noteInList = (page: Page, title: string) => page.locator(".tree-note", { hasText: title });

async function addSpace(page: Page, name: string): Promise<void> {
  await openSettingsPage(page, "一般");
  await page.getByRole("button", { name: "スペースを追加" }).click();
  const prompt = page.getByRole("dialog", { name: "スペースの名前" });
  await prompt.getByRole("textbox").fill(name);
  await prompt.getByRole("button", { name: "保存" }).click();
}

async function switchSpace(page: Page, name: string): Promise<void> {
  await spaceSwitcher(page).click();
  await page.getByRole("menuitemradio", { name }).click();
}

test("スペースを足すと、メモの保管先が分かれる。足すときは、同じパスフレーズを確かめる。切り替えて戻るときは、パスフレーズを聞かない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "個人のメモ");
  await addSpace(page, "仕事");

  // 足したスペースの最初の設定。ほかのスペースと違うパスフレーズは受け付けない。
  await expect(page.getByRole("heading", { name: "スペース「仕事」を始める" })).toBeVisible();
  await page.getByLabel("パスフレーズ", { exact: true }).fill("another passphrase");
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "作成" }).click();

  await expect(page.getByRole("button", { name: "新しいメモ" })).toBeVisible();
  await expect(noteInList(page, "個人のメモ")).toHaveCount(0);
  await createNoteOnDesktop(page, "仕事のメモ");
  await expect(spaceSwitcher(page)).toHaveText("仕事");

  // 切り替えると、そのスペースのメモだけが出る。解除してあるスペースへは、パスフレーズを聞かずに戻れる。
  await switchSpace(page, "最初のスペース");
  await expect(noteInList(page, "個人のメモ").first()).toBeVisible();
  await expect(noteInList(page, "仕事のメモ")).toHaveCount(0);
  await switchSpace(page, "仕事");
  await expect(noteInList(page, "仕事のメモ").first()).toBeVisible();

  // ロックすると、どのスペースも、パスフレーズを入れるまで開けない。ロックの画面でも、スペースを選べる。
  await page.keyboard.press("Control+l");
  await expect(page.getByRole("heading", { name: "ロックを解除" })).toBeVisible();
  await page.getByLabel("スペース").selectOption({ label: "最初のスペース" });
  await expect(page.getByRole("heading", { name: "ロックを解除" })).toBeVisible();
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "解除" }).click();
  await expect(noteInList(page, "個人のメモ").first()).toBeVisible();
});

test("スペースを足すのをやめられる。足したスペースは、パスフレーズを確かめて、このデバイスから消せる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "個人のメモ");
  await addSpace(page, "試し");
  await page.getByRole("button", { name: "やめる" }).click();
  // やめると、元のスペースに戻る（解除してあるので、そのまま開く）。
  await expect(noteInList(page, "個人のメモ").first()).toBeVisible();
  await expect(spaceSwitcher(page)).toHaveCount(0);

  await addSpace(page, "仕事");
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "作成" }).click();
  await createNoteOnDesktop(page, "仕事のメモ");
  await switchSpace(page, "最初のスペース");
  await openSettingsPage(page, "一般");
  const workSpace = page.locator(".space-list li", { hasText: "仕事" });
  await workSpace.getByRole("button", { name: "削除" }).click();
  const confirmation = page.getByRole("dialog", { name: /スペース「仕事」を、このデバイスから消します/ });
  await confirmation.getByLabel("パスフレーズ").fill(PASSPHRASE);
  await confirmation.getByRole("button", { name: "確認" }).click();
  await expect(page.locator(".space-list li")).toHaveCount(1);
  await expect(spaceSwitcher(page)).toHaveCount(0);
});

test("パスフレーズを変えると、全部のスペースのパスフレーズが変わる", async ({ page }) => {
  const NEW_PASSPHRASE = "a brand new passphrase";
  await startLocalVault(page);
  await addSpace(page, "仕事");
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByRole("button", { name: "作成" }).click();
  await createNoteOnDesktop(page, "仕事のメモ");

  await openSettingsPage(page, "セキュリティ");
  await page.getByLabel("今のパスフレーズ").fill(PASSPHRASE);
  await page.getByLabel("新しいパスフレーズ").fill(NEW_PASSPHRASE);
  await page.getByRole("button", { name: "パスフレーズを変更" }).click();
  await expect(page.locator(".form-success")).toBeVisible();

  // ロックして、変える操作をしていない方のスペースを、新しいパスフレーズで開く。
  await page.keyboard.press("Control+l");
  await page.getByLabel("スペース").selectOption({ label: "最初のスペース" });
  await page.getByLabel("パスフレーズ", { exact: true }).fill(NEW_PASSPHRASE);
  await page.getByRole("button", { name: "解除" }).click();
  await expect(page.getByRole("button", { name: "新しいメモ" })).toBeVisible();
});

test("スペースごとに、同期先を別にできる。ほかのデバイスには、参加した同期先のスペースのメモだけが届く", async ({ page, browser }) => {
  const personalRemote = await newTestRemoteConfig();
  const workRemote = await newTestRemoteConfig();
  await startSyncedVault(page, { remoteConfig: personalRemote, join: false });
  await createNoteOnDesktop(page, "個人のメモ");
  await syncNowOnDesktop(page, "個人のメモ");

  // 足したスペースは、別の同期先に、別の暗号化キーで置く。
  await addSpace(page, "仕事");
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await fillSyncTarget(page, workRemote);
  await page.getByRole("button", { name: "接続を確認" }).click();
  await expect(page.getByRole("status")).toContainText("空の同期先です");
  await page.getByRole("radio", { name: "自分で入力する" }).click();
  await page.getByLabel("暗号化キー", { exact: true }).fill(`${SYNC_KEY}-work`);
  await page.getByRole("button", { name: "作成" }).click();
  await createNoteOnDesktop(page, "仕事のメモ");
  await syncNowOnDesktop(page, "仕事のメモ");

  const otherDevice = await openSyncedDevice(browser, { remoteConfig: personalRemote, join: true });
  await expect(noteInList(otherDevice, "個人のメモ").first()).toBeVisible();
  await expect(noteInList(otherDevice, "仕事のメモ")).toHaveCount(0);
});

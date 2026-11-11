import { expect, type Page, test } from "@playwright/test";
import { type CorsRule, newTestRemoteConfig, newTestRemoteConfigWithCors } from "../integration/testStorage";
import type { RemoteConfig } from "../src/core/remote/remoteConfig";
import { S3ObjectStore } from "../src/core/remote/s3ObjectStore";
import { writeRemoteVault } from "../src/core/vault/remoteVault";
import { createVault } from "../src/core/vault/vaultDocument";
import { corsRuleJson } from "../src/ui/settings/corsRule";
import { createNoteOnDesktop, DESKTOP_VIEWPORT, fillRemoteConfigFields, fillSyncTarget, openSyncedDevice, PASSPHRASE, startLocalVault, SYNC_KEY } from "./devices";

// 画面の試験の開発サーバーの origin（playwright.config.ts の baseURL）。
const PAGE_ORIGIN = "http://127.0.0.1:5173";
// 2 台目のデバイスのパスフレーズ。デバイスごとに違ってよいことを確かめるために、1 台目と変える。
const SECOND_DEVICE_PASSPHRASE = "another device passphrase";
const GENERATED_KEY_PATTERN = /^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/;

async function openSetupWithSync(page: Page, remoteConfig: RemoteConfig, passphrase: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("パスフレーズ", { exact: true }).fill(passphrase);
  await page.getByLabel("パスフレーズ（確認）").fill(passphrase);
  await fillSyncTarget(page, remoteConfig);
}

test("生成した暗号化キーは 1 度だけ表示され、そのキーとデバイスごとのパスフレーズで、もう 1 台が参加できる", async ({ browser }) => {
  const remoteConfig = await newTestRemoteConfig();
  const laptop = await (await browser.newContext({ viewport: DESKTOP_VIEWPORT })).newPage();
  await openSetupWithSync(laptop, remoteConfig, PASSPHRASE);
  await laptop.getByRole("button", { name: "接続を確認" }).click();
  await expect(laptop.getByRole("status")).toContainText("空の同期先です");
  await laptop.getByRole("button", { name: "作成" }).click();

  const keyDialog = laptop.getByRole("dialog", { name: "暗号化キー" });
  const generatedKey = await keyDialog.locator("code").innerText();
  expect(generatedKey).toMatch(GENERATED_KEY_PATTERN);
  await keyDialog.getByRole("button", { name: "控えました" }).click();
  await expect(keyDialog).toBeHidden();
  await createNoteOnDesktop(laptop, "1 台目で書いたメモ");
  await expect(laptop.getByText(/同期済み/)).toBeVisible({ timeout: 20_000 });
  // 閉じたあとは、設定のどこにも出ない。
  await laptop.locator(".sync-line").click();
  await expect(laptop.locator(".settings")).not.toContainText(generatedKey);

  const phone = await (await browser.newContext({ viewport: DESKTOP_VIEWPORT })).newPage();
  await openSetupWithSync(phone, remoteConfig, SECOND_DEVICE_PASSPHRASE);
  await phone.getByRole("button", { name: "接続を確認" }).click();
  await expect(phone.getByRole("status")).toContainText("既存のメモが見つかりました");
  // 1 台目のパスフレーズは、暗号化キーの代わりにならない。
  await phone.getByLabel("暗号化キー", { exact: true }).fill(PASSPHRASE);
  await phone.getByRole("button", { name: "参加" }).click();
  await expect(phone.getByRole("alert")).toContainText("暗号化キーが違います");
  await phone.getByLabel("暗号化キー", { exact: true }).fill(generatedKey);
  await phone.getByRole("button", { name: "参加" }).click();
  await expect(phone.getByRole("button", { name: /1 台目で書いたメモ/ }).first()).toBeVisible({ timeout: 20_000 });

  // 2 台目は、自分のパスフレーズでロックを解除する。
  await phone.reload();
  await phone.getByLabel("パスフレーズ").fill(SECOND_DEVICE_PASSPHRASE);
  await phone.getByRole("button", { name: "解除" }).click();
  await expect(phone.getByRole("button", { name: /1 台目で書いたメモ/ }).first()).toBeVisible();
});

test("フォルダを入れずに接続を確認すると、既存のメモのあるフォルダが見つかり、そこに参加できる", async ({ browser }) => {
  // ほかの試験のフォルダが候補に混ざらないように、この試験だけのバケットを使い、前の回の中身を消してから始める。
  const rules = JSON.parse(corsRuleJson(PAGE_ORIGIN)) as CorsRule[];
  const remoteConfig = { ...(await newTestRemoteConfigWithCors("sedum-note-find-folder", rules)), prefix: "family-notes" };
  const wholeBucket = new S3ObjectStore({ ...remoteConfig, prefix: "" });
  for (const object of await wholeBucket.list("")) {
    await wholeBucket.delete(object.key);
  }
  const laptop = await openSyncedDevice(browser, { remoteConfig, join: false });
  await createNoteOnDesktop(laptop, "フォルダの中のメモ");
  await expect(laptop.getByText(/同期済み/)).toBeVisible({ timeout: 20_000 });

  const phone = await (await browser.newContext({ viewport: DESKTOP_VIEWPORT })).newPage();
  await openSetupWithSync(phone, { ...remoteConfig, prefix: "" }, SECOND_DEVICE_PASSPHRASE);
  await phone.getByRole("button", { name: "接続を確認" }).click();
  await expect(phone.getByRole("status")).toContainText("フォルダ「family-notes」に既存のメモが見つかったので、そこを同期先にしました");
  await expect(phone.getByLabel("フォルダ")).toHaveValue("family-notes");
  await phone.getByLabel("暗号化キー", { exact: true }).fill(SYNC_KEY);
  await phone.getByRole("button", { name: "参加" }).click();
  await expect(phone.getByRole("button", { name: /フォルダの中のメモ/ }).first()).toBeVisible({ timeout: 20_000 });
});

test("同期なしで始めたあと、設定で同期先を足せる。暗号化キーを作り直すと、前のキーでは参加できない", async ({ browser }) => {
  const remoteConfig = await newTestRemoteConfig();
  const laptop = await (await browser.newContext({ viewport: DESKTOP_VIEWPORT })).newPage();
  await startLocalVault(laptop);
  await createNoteOnDesktop(laptop, "同期の前に書いたメモ");
  await laptop.locator(".sync-line").click();
  const syncSection = laptop.locator(".settings-section", { has: laptop.getByRole("heading", { name: "同期", exact: true }) });
  await fillRemoteConfigFields(laptop, remoteConfig);
  // 確かめる前は保存できない。
  await expect(syncSection.getByRole("button", { name: "保存して同期" })).toBeDisabled();
  await syncSection.getByRole("button", { name: "接続を確認" }).click();
  await expect(syncSection.getByRole("status")).toContainText("空の同期先です");
  await syncSection.getByLabel("このデバイスのパスフレーズ").fill(PASSPHRASE);
  await syncSection.getByRole("button", { name: "保存して同期" }).click();
  const keyDialog = laptop.getByRole("dialog", { name: "暗号化キー" });
  const firstKey = await keyDialog.locator("code").innerText();
  await keyDialog.getByRole("button", { name: "控えました" }).click();

  // 暗号化キーを作り直す。パスフレーズが違うと作り直さない。
  await laptop.locator(".sync-line").click();
  const keySection = laptop.locator(".settings-section", { has: laptop.getByRole("heading", { name: "暗号化キー", exact: true }) });
  await keySection.getByLabel("このデバイスのパスフレーズ").fill("wrong horse battery");
  await keySection.getByLabel("前の暗号化キーでは参加できなくなること、メモは暗号化し直さないことを確かめました").check();
  await keySection.getByRole("button", { name: "暗号化キーを作り直す" }).click();
  await expect(keySection.getByRole("alert")).toContainText("パスフレーズが違います");
  await keySection.getByLabel("このデバイスのパスフレーズ").fill(PASSPHRASE);
  await keySection.getByRole("button", { name: "暗号化キーを作り直す" }).click();
  const secondKey = await keyDialog.locator("code").innerText();
  expect(secondKey).not.toBe(firstKey);
  await keyDialog.getByRole("button", { name: "控えました" }).click();

  const phone = await (await browser.newContext({ viewport: DESKTOP_VIEWPORT })).newPage();
  await openSetupWithSync(phone, remoteConfig, SECOND_DEVICE_PASSPHRASE);
  await phone.getByRole("button", { name: "接続を確認" }).click();
  await phone.getByLabel("暗号化キー", { exact: true }).fill(firstKey);
  await phone.getByRole("button", { name: "参加" }).click();
  await expect(phone.getByRole("alert")).toContainText("暗号化キーが違います");
  // 同期先が変わっていないので、確かめ直さずにキーだけ入れ直せる。
  await phone.getByLabel("暗号化キー", { exact: true }).fill(secondKey);
  await phone.getByRole("button", { name: "参加" }).click();
  await expect(phone.getByRole("button", { name: /同期の前に書いたメモ/ }).first()).toBeVisible({ timeout: 20_000 });
});

test("自動の同期を切ると、編集しても送らず、「今すぐ同期」で送る。切った設定は開き直しても保たれる", async ({ browser }) => {
  const remoteConfig = await newTestRemoteConfig();
  const laptop = await openSyncedDevice(browser, { remoteConfig, join: false });
  await laptop.locator(".sync-line").click();
  await laptop.getByLabel("自動で同期する").uncheck();
  await createNoteOnDesktop(laptop, "自動の同期を切って書いたメモ");
  // 自動なら 2 秒後に送る。それより長く待っても、未送信のまま。
  await laptop.waitForTimeout(4_000);
  await expect(laptop.locator(".sync-line")).toContainText("未送信 1件");

  await laptop.reload();
  await laptop.getByLabel("パスフレーズ").fill(PASSPHRASE);
  await laptop.getByRole("button", { name: "解除" }).click();
  await laptop.locator(".sync-line").click();
  await expect(laptop.getByLabel("自動で同期する")).not.toBeChecked();
  await laptop.getByRole("button", { name: "今すぐ同期" }).click();
  await expect(laptop.locator(".sync-line")).toContainText("自動の同期はオフ");
  await expect(laptop.locator(".sync-line")).not.toContainText("未送信");
});

test("v0.2 までの同期先には、作ったときのパスフレーズで参加でき、設定で暗号化キーを作ると新しい形になる", async ({ browser }) => {
  // v0.2 のアプリが作った同期先: パスフレーズで包んだ vault.json だけがある。
  const remoteConfig = await newTestRemoteConfig();
  const { document } = await createVault(PASSPHRASE);
  await writeRemoteVault(new S3ObjectStore(remoteConfig), document, { ifAbsent: true });

  const laptop = await (await browser.newContext({ viewport: DESKTOP_VIEWPORT })).newPage();
  await openSetupWithSync(laptop, remoteConfig, SECOND_DEVICE_PASSPHRASE);
  await laptop.getByRole("button", { name: "接続を確認" }).click();
  await expect(laptop.getByRole("status")).toContainText("既存のメモが見つかりました");
  await laptop.getByLabel("作ったときのパスフレーズ").fill(PASSPHRASE);
  await laptop.getByRole("button", { name: "参加" }).click();
  await createNoteOnDesktop(laptop, "v0.2 の同期先に書いたメモ");
  await expect(laptop.getByText(/同期済み/)).toBeVisible({ timeout: 20_000 });

  await laptop.locator(".sync-line").click();
  const keySection = laptop.locator(".settings-section", { has: laptop.getByRole("heading", { name: "暗号化キー", exact: true }) });
  await expect(keySection.getByRole("status")).toContainText("暗号化キーがまだありません");
  await keySection.getByLabel("このデバイスのパスフレーズ").fill(SECOND_DEVICE_PASSPHRASE);
  await keySection.getByLabel("v0.2 までのアプリを入れたデバイスは、アプリを更新するまで同期できなくなることを確かめました").check();
  await keySection.getByRole("button", { name: "暗号化キーを作り直す" }).click();
  const keyDialog = laptop.getByRole("dialog", { name: "暗号化キー" });
  const newKey = await keyDialog.locator("code").innerText();
  await keyDialog.getByRole("button", { name: "控えました" }).click();
  await expect(keySection.getByText("暗号化キーがまだありません")).toBeHidden();

  // 新しい形になったあとも、このデバイスは同期を続けられる。新しいデバイスは暗号化キーで参加する。
  await laptop.getByRole("button", { name: "今すぐ同期" }).click();
  await expect(laptop.locator(".sync-line")).toContainText("同期済み", { timeout: 20_000 });
  const phone = await (await browser.newContext({ viewport: DESKTOP_VIEWPORT })).newPage();
  await openSetupWithSync(phone, remoteConfig, PASSPHRASE);
  await phone.getByRole("button", { name: "接続を確認" }).click();
  await phone.getByLabel("暗号化キー", { exact: true }).fill(newKey);
  await phone.getByRole("button", { name: "参加" }).click();
  await expect(phone.getByRole("button", { name: /v0.2 の同期先に書いたメモ/ }).first()).toBeVisible({ timeout: 20_000 });
});

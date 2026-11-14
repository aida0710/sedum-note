import { readFileSync, writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { type CorsRule, newTestRemoteConfig, newTestRemoteConfigWithCors } from "../integration/testStorage";
import type { S3RemoteConfig } from "../src/core/remote/remoteConfig";
import { S3ObjectStore } from "../src/core/remote/s3ObjectStore";
import { readRemoteVault, writeRemoteVault } from "../src/core/vault/remoteVault";
import { createVault } from "../src/core/vault/vaultDocument";
import { corsRuleJson } from "../src/ui/settings/corsRule";
import { createNoteOnDesktop, DESKTOP_VIEWPORT, fillRemoteConfigFields, fillSyncTarget, openSyncedDevice, PASSPHRASE, PHONE_VIEWPORT, startLocalVault, SYNC_KEY } from "./devices";
import { PAGE_ORIGIN } from "./devServer";

// 2 台目のデバイスのパスフレーズ。デバイスごとに違ってよいことを確かめるために、1 台目と変える。
const SECOND_DEVICE_PASSPHRASE = "another device passphrase";
const GENERATED_KEY_PATTERN = /^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/;

async function openSetupWithSync(page: Page, remoteConfig: S3RemoteConfig, passphrase: string): Promise<void> {
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
  await expect(phone.getByRole("alert")).toContainText("暗号化キーが正しくありません。");
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
  // 同期先を初めて保存しても、開いていたタブと、設定の「同期」のページはそのまま。
  await expect(laptop.getByRole("tab")).toHaveText([/同期の前に書いたメモ/, /設定/]);
  await expect(laptop.getByRole("tab", { name: "設定" })).toHaveAttribute("aria-selected", "true");
  await expect(laptop.getByRole("heading", { name: "同期", exact: true })).toBeVisible();

  // 暗号化キーを作り直す。パスフレーズが違うと作り直さない。
  await laptop.locator(".sync-line").click();
  const keySection = laptop.locator(".settings-section", { has: laptop.getByRole("heading", { name: "暗号化キー", exact: true }) });
  await keySection.getByLabel("このデバイスのパスフレーズ").fill("wrong horse battery");
  await keySection.getByLabel("前の暗号化キーで参加できなくなることと、メモを再暗号化しないことを理解しました").check();
  await keySection.getByRole("button", { name: "暗号化キーを再生成" }).click();
  await expect(keySection.getByRole("alert")).toContainText("パスフレーズが正しくありません。");
  await keySection.getByLabel("このデバイスのパスフレーズ").fill(PASSPHRASE);
  await keySection.getByRole("button", { name: "暗号化キーを再生成" }).click();
  const secondKey = await keyDialog.locator("code").innerText();
  expect(secondKey).not.toBe(firstKey);
  await keyDialog.getByRole("button", { name: "控えました" }).click();

  const phone = await (await browser.newContext({ viewport: DESKTOP_VIEWPORT })).newPage();
  await openSetupWithSync(phone, remoteConfig, SECOND_DEVICE_PASSPHRASE);
  await phone.getByRole("button", { name: "接続を確認" }).click();
  await phone.getByLabel("暗号化キー", { exact: true }).fill(firstKey);
  await phone.getByRole("button", { name: "参加" }).click();
  await expect(phone.getByRole("alert")).toContainText("暗号化キーが正しくありません。");
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

test("暗号化キーは、自動で生成するか自分で入力するかを選べる。短すぎるキーは断る", async ({ browser }) => {
  const remoteConfig = await newTestRemoteConfig();
  const laptop = await (await browser.newContext({ viewport: DESKTOP_VIEWPORT })).newPage();
  await openSetupWithSync(laptop, remoteConfig, PASSPHRASE);
  await laptop.getByRole("button", { name: "接続を確認" }).click();
  // 既定は「自動で生成する」。
  await expect(laptop.getByRole("radio", { name: "自動で生成する" })).toBeChecked();
  await laptop.getByRole("radio", { name: "自分で入力する" }).click();
  await laptop.getByLabel("暗号化キー", { exact: true }).fill("short");
  await laptop.getByRole("button", { name: "作成" }).click();
  await expect(laptop.getByRole("alert")).toContainText("暗号化キーは12文字以上にしてください。");
  await laptop.getByLabel("暗号化キー", { exact: true }).fill(SYNC_KEY);
  await laptop.getByRole("button", { name: "作成" }).click();
  // 自分で入力したキーは、あらためて表示しない。
  await expect(laptop.getByRole("button", { name: "新しいメモ" })).toBeVisible();
  await expect(laptop.getByRole("dialog", { name: "暗号化キー" })).toBeHidden();

  // 作り直すときも、どちらかを選べる。
  await laptop.locator(".sync-line").click();
  const keySection = laptop.locator(".settings-section", { has: laptop.getByRole("heading", { name: "暗号化キー", exact: true }) });
  await keySection.getByRole("radio", { name: "自分で入力する" }).click();
  await keySection.getByLabel("暗号化キー", { exact: true }).fill("another-key-of-my-own");
  await keySection.getByLabel("このデバイスのパスフレーズ").fill(PASSPHRASE);
  await keySection.getByLabel("前の暗号化キーで参加できなくなることと、メモを再暗号化しないことを理解しました").check();
  await keySection.getByRole("button", { name: "暗号化キーを再生成" }).click();
  await expect(keySection.getByText("暗号化キーを再生成しました")).toBeVisible();

  const phone = await (await browser.newContext({ viewport: DESKTOP_VIEWPORT })).newPage();
  await openSetupWithSync(phone, remoteConfig, SECOND_DEVICE_PASSPHRASE);
  await phone.getByRole("button", { name: "接続を確認" }).click();
  await phone.getByLabel("暗号化キー", { exact: true }).fill("another-key-of-my-own");
  await phone.getByRole("button", { name: "参加" }).click();
  await expect(phone.getByRole("button", { name: "新しいメモ" })).toBeVisible({ timeout: 20_000 });
});

test("v0.2 までのアプリで作った同期先は、確かめた時点で使えないと知らせる", async ({ page }) => {
  // v0.2 のアプリが作った同期先: パスフレーズで包んだ vault.json がある。
  const remoteConfig = await newTestRemoteConfig();
  const { document } = await createVault(PASSPHRASE);
  await writeRemoteVault(new S3ObjectStore(remoteConfig), document, { ifAbsent: true });
  await openSetupWithSync(page, remoteConfig, PASSPHRASE);
  await page.getByRole("button", { name: "接続を確認" }).click();
  await expect(page.getByRole("alert")).toContainText("v0.2以前のアプリで作成されたため、このバージョンでは使えません");
  await expect(page.getByRole("button", { name: "作成" })).toBeDisabled();
});

test("同期を設定したあとの設定の画面は、同期先の要約を出す。「同期先を変更」で開き、同じメモの同期先なら暗号化キーを聞かない", async ({ browser }) => {
  const remoteConfig = await newTestRemoteConfig();
  const laptop = await openSyncedDevice(browser, { remoteConfig, join: false });
  await laptop.locator(".sync-line").click();
  const syncSection = laptop.locator(".settings-section", { has: laptop.getByRole("heading", { name: "同期", exact: true }) });
  await expect(syncSection).toContainText(`同期先: バケット「${remoteConfig.bucket}」（${remoteConfig.prefix}）`);
  await expect(syncSection.getByLabel("エンドポイント")).toBeHidden();

  await syncSection.getByRole("button", { name: "同期先を変更" }).click();
  await expect(syncSection.getByLabel("エンドポイント")).toHaveValue(remoteConfig.endpoint);
  await syncSection.getByRole("button", { name: "接続を確認" }).click();
  await expect(syncSection.locator(".sync-target-result")).toContainText("このデバイスのメモと同じものです");
  await expect(syncSection.getByLabel("暗号化キー", { exact: true })).toBeHidden();
  await syncSection.getByRole("button", { name: "保存して同期" }).click();
  // 保存すると、要約に戻る。
  await expect(syncSection.getByRole("button", { name: "同期先を変更" })).toBeVisible();
  await expect(laptop.locator(".sync-line")).toContainText("同期済み", { timeout: 20_000 });
});

test("同期の設定を、暗号化キーを入力せずに書き出せる。ファイルでも QR でも、暗号化キーを入れると取り込めて参加できる", async ({ browser }, testInfo) => {
  const remoteConfig = await newTestRemoteConfig();
  const laptop = await openSyncedDevice(browser, { remoteConfig, join: false });
  await createNoteOnDesktop(laptop, "書き出す側のメモ");
  await expect(laptop.getByText(/同期済み/)).toBeVisible({ timeout: 20_000 });

  // 書き出す。暗号化キーもパスフレーズも聞かれない。
  await laptop.locator(".sync-line").click();
  await laptop.getByRole("button", { name: "同期設定をエクスポート" }).click();
  const exportDialog = laptop.getByRole("dialog", { name: "同期の設定を渡す" });
  const download = laptop.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "ファイルに保存" }).click();
  const setupFile = testInfo.outputPath("sync-setup.sedumsync");
  await (await download).saveAs(setupFile);
  const setupText = readFileSync(setupFile, "utf8");
  for (const secret of [remoteConfig.secretAccessKey, remoteConfig.accessKeyId, remoteConfig.bucket, SYNC_KEY, PASSPHRASE]) {
    expect(setupText).not.toContain(secret);
  }
  // 画面の QR を、撮った写真の代わりに画像のファイルにする。
  const qrCodeImage = await exportDialog.getByRole("img", { name: "同期の設定の QR コード" }).getAttribute("src");
  const qrCodeFile = testInfo.outputPath("sync-setup-qr.png");
  writeFileSync(qrCodeFile, Buffer.from(qrCodeImage!.split(",")[1]!, "base64"));

  const joinWith = async (pickLabel: string, file: string) => {
    const device = await (await browser.newContext({ viewport: DESKTOP_VIEWPORT })).newPage();
    await device.goto("/");
    await device.getByLabel("パスフレーズ", { exact: true }).fill(SECOND_DEVICE_PASSPHRASE);
    await device.getByLabel("パスフレーズ（確認）").fill(SECOND_DEVICE_PASSPHRASE);
    await device.getByLabel("ほかのデバイスと同期する").check();
    await device.locator(`input[type="file"][aria-label="${pickLabel}"]`).setInputFiles(file);
    await expect(device.getByText("同期の設定を読みました")).toBeVisible();
    // 違う暗号化キーでは開かず、同期先の欄にも何も入らない。
    await device.getByLabel("暗号化キー", { exact: true }).fill("not-the-shared-key");
    await device.getByRole("button", { name: "インポート" }).click();
    await expect(device.getByRole("alert")).toContainText("暗号化キーが正しくありません。");
    await expect(device.getByLabel("バケット")).toHaveValue("");
    // Enter は、画面全体の「作成」ではなく、この欄の「取り込む」に効く。
    await device.getByLabel("暗号化キー", { exact: true }).fill(SYNC_KEY);
    await device.getByLabel("暗号化キー", { exact: true }).press("Enter");
    // 同期先が入り、確かめまで済んで、暗号化キーも入っている。あとは参加を押すだけ。
    await expect(device.getByText("同期設定をインポートしました")).toBeVisible();
    await expect(device.getByLabel("バケット")).toHaveValue(remoteConfig.bucket);
    await expect(device.getByLabel("フォルダ")).toHaveValue(remoteConfig.prefix);
    await expect(device.locator(".sync-target-result")).toContainText("既存のメモが見つかりました");
    await expect(device.getByLabel("暗号化キー", { exact: true })).toHaveValue(SYNC_KEY);
    await device.getByRole("button", { name: "参加" }).click();
    await expect(device.getByRole("button", { name: /書き出す側のメモ/ }).first()).toBeVisible({ timeout: 20_000 });
  };
  await joinWith("設定ファイルを選択", setupFile);
  await joinWith("QRコードの画像を選択", qrCodeFile);

});

test("カメラをかざして QR を読むと、暗号化キーを聞かれ、入れると同期先が入って確認まで進む", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "カメラの映像の代わりに使う canvas の映像は、試験用の WebKit では再生されない");
  // カメラで読む。カメラの映像の代わりに、QR を描いた映像を返す。
  const remoteConfig = await newTestRemoteConfig();
  const laptop = await openSyncedDevice(browser, { remoteConfig, join: false });
  await laptop.locator(".sync-line").click();
  await laptop.getByRole("button", { name: "同期設定をエクスポート" }).click();
  const qrCodeImage = await laptop.getByRole("img", { name: "同期の設定の QR コード" }).getAttribute("src");

  const phone = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await phone.addInitScript((image) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const picture = new Image();
      picture.src = image;
      await picture.decode();
      const canvas = document.createElement("canvas");
      canvas.width = picture.width;
      canvas.height = picture.height;
      const context = canvas.getContext("2d")!;
      // 止まった絵だと映像のコマが出ないブラウザがあるので、描き続ける。
      setInterval(() => context.drawImage(picture, 0, 0), 100);
      context.drawImage(picture, 0, 0);
      return canvas.captureStream(10);
    };
  }, qrCodeImage!);
  await phone.goto("/");
  await phone.getByLabel("ほかのデバイスと同期する").check();
  await phone.getByRole("button", { name: "カメラで QR を読む" }).click();
  // 読めたら、ダイアログが閉じて、暗号化キーを聞く。
  await expect(phone.getByText("同期の設定を読みました")).toBeVisible();
  await expect(phone.getByRole("dialog", { name: "QR を読む" })).toBeHidden();
  await phone.getByLabel("暗号化キー", { exact: true }).fill(SYNC_KEY);
  await phone.getByRole("button", { name: "インポート" }).click();
  await expect(phone.locator(".sync-target-result")).toContainText("既存のメモが見つかりました");
});

test("カメラを許可しなかったときは、ほかの読み方を案内し、そのボタンをダイアログの中に出す", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await page.goto("/");
  await page.getByLabel("ほかのデバイスと同期する").check();
  await page.getByRole("button", { name: "カメラで QR を読む" }).click();
  const scanner = page.getByRole("dialog", { name: "QR を読む" });
  await expect(scanner.getByRole("alert")).toContainText("カメラへのアクセスが許可されていません");
  await expect(scanner.getByRole("button", { name: "設定ファイルを選択" })).toBeVisible();
  // ダイアログの中のボタンで、ダイアログを閉じて、画像を選ぶ画面が開く。
  const fileChooser = page.waitForEvent("filechooser");
  await scanner.getByRole("button", { name: "QRコードの画像を選択" }).click();
  await fileChooser;
  await expect(scanner).toHaveCount(0);
});

test("同期の設定でないファイルや、QR の無い写真を選ぶと、暗号化キーを聞く前に知らせる", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByLabel("ほかのデバイスと同期する").check();
  const otherFile = testInfo.outputPath("notes.json");
  writeFileSync(otherFile, JSON.stringify({ hello: "world" }));
  await page.locator('input[type="file"][aria-label="設定ファイルを選択"]').setInputFiles(otherFile);
  await expect(page.getByRole("alert")).toContainText("同期設定として読み込めません");
  // 1x1 の PNG（QR は写っていない）。
  const blankPhoto = testInfo.outputPath("blank.png");
  writeFileSync(blankPhoto, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
  await page.locator('input[type="file"][aria-label="QRコードの画像を選択"]').setInputFiles(blankPhoto);
  await expect(page.getByRole("alert")).toContainText("画像からQRコードを読み取れませんでした");
  await expect(page.getByLabel("暗号化キー", { exact: true })).toBeHidden();
});

test("同期に失敗すると、左下の状態は色の点ではなく警告の印になり、理由を title で読める", async ({ browser }) => {
  const remoteConfig = await newTestRemoteConfig();
  const laptop = await openSyncedDevice(browser, { remoteConfig, join: false });
  const syncLine = laptop.locator(".sync-line");
  await expect(syncLine.locator(".status-dot")).toHaveCount(1);
  await expect(syncLine).not.toHaveAttribute("title", /.+/);

  // 同期先につながらなくして、「今すぐ同期」を押す。
  await laptop.route(`${remoteConfig.endpoint}/**`, (route) => route.abort());
  await syncLine.click();
  await laptop.getByRole("button", { name: "今すぐ同期" }).click();
  await expect(syncLine).toContainText("同期に失敗しました", { timeout: 20_000 });
  await expect(syncLine.locator(".sync-failure-mark")).toHaveCount(1);
  await expect(syncLine.locator(".status-dot")).toHaveCount(0);
  await expect(syncLine).toHaveAttribute("title", /^同期に失敗しました: ストレージに接続できません/);
});

test("同期の失敗が「アプリの更新が必要」のときは、同期のページの知らせの下から設定の「更新」のページへ移れる", async ({ browser }) => {
  const remoteConfig = await newTestRemoteConfig();
  const laptop = await openSyncedDevice(browser, { remoteConfig, join: false });
  await expect(laptop.getByText(/同期済み/)).toBeVisible({ timeout: 20_000 });
  // 新しいバージョンのアプリが、同期先のデータの形の版を上げたことにする。
  const objectStore = new S3ObjectStore(remoteConfig);
  const stored = (await readRemoteVault(objectStore))!;
  await writeRemoteVault(objectStore, { ...stored.document, bodySchema: stored.document.bodySchema + 1 }, { ifMatch: stored.etag });

  await laptop.locator(".sync-line").click();
  await laptop.getByRole("button", { name: "今すぐ同期" }).click();
  await expect(laptop.getByRole("alert").filter({ hasText: "このアプリを更新してください" }).first()).toBeVisible({ timeout: 20_000 });
  await laptop.getByRole("button", { name: "更新を確認" }).click();
  await expect(laptop.getByRole("heading", { name: "更新" })).toBeVisible();
});

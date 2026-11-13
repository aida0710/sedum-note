// 時間のかかる処理（同期、バックアップのエクスポート）の間に、件数と進み具合の棒が出るか。
// 処理の途中を見るために、同期先からの取得を止めておき、表示を確かめてから流す（待ち時間には頼らない）。

import { expect, type Page, test } from "@playwright/test";
import { newTestRemoteConfig } from "../integration/testStorage";
import { createNoteOnDesktop, DESKTOP_VIEWPORT, openSettingsPage, startSyncedVault, syncNowOnDesktop } from "./devices";

// 同期先のオブジェクトのうち、prefix の下の 1 件を取る GET（一覧の取得は含まない）。
function holdObjectGets(page: Page, prefix: "records" | "blobs"): () => void {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  void page.route((url) => new RegExp(`/${prefix}/[^/]+$`).test(url.pathname), async (route) => {
    if (route.request().method() === "GET") {
      await released;
    }
    await route.continue();
  });
  return release;
}

test("ほかのデバイスのメモを受け取る間、左下の同期の状態に受信の件数が出る", async ({ browser }) => {
  const remoteConfig = await newTestRemoteConfig();
  const laptop = await (await browser.newContext({ viewport: DESKTOP_VIEWPORT })).newPage();
  await startSyncedVault(laptop, { remoteConfig, join: false });
  for (const title of ["一つ目", "二つ目", "三つ目"]) {
    await createNoteOnDesktop(laptop, title);
  }
  await syncNowOnDesktop(laptop, "三つ目");

  const phone = await (await browser.newContext({ viewport: DESKTOP_VIEWPORT })).newPage();
  const releaseRecords = holdObjectGets(phone, "records");
  await startSyncedVault(phone, { remoteConfig, join: true });
  await expect(phone.locator(".sync-line")).toHaveText("同期しています（受信 0/3件）");
  releaseRecords();
  await expect(phone.locator(".sync-line")).toContainText("同期済み");
  await expect(phone.locator("button.tree-note")).toHaveCount(3);
});

test("同期先から添付を取ってバックアップに入れる間、件数と進み具合の棒が出る", async ({ browser }) => {
  const remoteConfig = await newTestRemoteConfig();
  const laptop = await (await browser.newContext({ viewport: DESKTOP_VIEWPORT })).newPage();
  await startSyncedVault(laptop, { remoteConfig, join: false });
  await createNoteOnDesktop(laptop, "添付のあるメモ");
  await laptop.locator('input[type="file"]:not([accept])').setInputFiles({ name: "memo.txt", mimeType: "text/plain", buffer: Buffer.from("添付の中身") });
  await expect(laptop.locator(".attachment-file")).toContainText("memo.txt");
  await syncNowOnDesktop(laptop, "添付のあるメモ");

  // 参加したデバイスは、添付をまだ取っていない（添付は開いたときに取る）。バックアップのときに同期先から取る。
  const phone = await (await browser.newContext({ viewport: DESKTOP_VIEWPORT })).newPage();
  await startSyncedVault(phone, { remoteConfig, join: true });
  await expect(phone.locator(".sync-line")).toContainText("同期済み");
  const releaseBlobs = holdObjectGets(phone, "blobs");
  await openSettingsPage(phone, "データ");
  const download = phone.waitForEvent("download");
  await phone.getByRole("button", { name: "バックアップを書き出す" }).click();
  // 記録（メモ 1 件）は入れ終え、添付の 1 件を取っているところ。
  await expect(phone.getByRole("status").filter({ hasText: "バックアップをエクスポートしています" })).toHaveText("バックアップをエクスポートしています（1/2件）");
  await expect(phone.getByRole("progressbar", { name: "バックアップをエクスポートしています" })).toHaveAttribute("aria-valuenow", "1");
  releaseBlobs();
  await download;
  await expect(phone.getByText("1件のメモを書き出しました")).toBeVisible();
  await expect(phone.getByRole("progressbar")).toHaveCount(0);
});

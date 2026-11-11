// 画面の試験で使う「デバイス」（別々の保存を持つブラウザのページ）の用意。

import { type Browser, expect, type Page } from "@playwright/test";
import type { RemoteConfig } from "../src/core/remote/remoteConfig";

export const PASSPHRASE = "correct horse battery";
export const DESKTOP_VIEWPORT = { width: 1280, height: 820 };
export const PHONE_VIEWPORT = { width: 390, height: 844 };

// 同期なしの vault を作って、メモの画面まで進める。
export async function startLocalVault(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
  await page.getByRole("button", { name: "作成" }).click();
}

type SyncedDeviceInput = {
  remoteConfig: RemoteConfig;
  // true なら、ほかのデバイスが作った vault に参加する。
  join: boolean;
  viewport?: { width: number; height: number };
};

export async function openSyncedDevice(browser: Browser, { remoteConfig, join, viewport = DESKTOP_VIEWPORT }: SyncedDeviceInput): Promise<Page> {
  const page = await (await browser.newContext({ viewport })).newPage();
  await page.goto("/");
  if (join) {
    await page.getByRole("tab", { name: "既存のメモに参加" }).click();
  } else {
    await page.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
    await page.getByLabel("ほかのデバイスと同期する").check();
  }
  await page.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
  await page.getByLabel("エンドポイント").fill(remoteConfig.endpoint);
  await page.getByLabel("バケット").fill(remoteConfig.bucket);
  await page.getByLabel("リージョン").fill(remoteConfig.region);
  await page.getByLabel("フォルダ").fill(remoteConfig.prefix);
  await page.getByLabel("アクセスキー ID").fill(remoteConfig.accessKeyId);
  await page.getByLabel("シークレットアクセスキー").fill(remoteConfig.secretAccessKey);
  await page.getByRole("button", { name: join ? "参加" : "作成" }).click();
  return page;
}

// PC の画面で、設定の「今すぐ同期」を押して終わるのを待ち、元のメモのタブへ戻る。
export async function syncNowOnDesktop(page: Page, noteTitle: string): Promise<void> {
  await page.locator(".sync-line").click();
  const syncNow = page.getByRole("button", { name: "今すぐ同期" });
  await syncNow.click();
  await syncNow.and(page.locator(":enabled")).waitFor();
  await page.getByRole("tab", { name: noteTitle }).click();
}

// PC の画面で新しいメモを作り、タイトルを入れて、本文にカーソルを移す。
export async function createNoteOnDesktop(page: Page, title: string): Promise<void> {
  // メモの画面が出てから数える（最初の画面の「新しく始める」などの切り替えもタブなので）。
  const newNoteButton = page.getByRole("button", { name: "新しいメモ" });
  await newNoteButton.waitFor();
  const tabsBefore = await page.getByRole("tab").count();
  await newNoteButton.click();
  // 新しいメモのタブが開いてから打つ。早すぎると、前に開いていたメモのタイトル欄に入る。
  await expect(page.getByRole("tab")).toHaveCount(tabsBefore + 1);
  await page.getByPlaceholder("タイトル").fill(title);
  await page.getByPlaceholder("タイトル").press("Enter");
}

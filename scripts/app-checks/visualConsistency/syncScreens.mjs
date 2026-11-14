// 同期を設定する途中と、設定したあとの画面（暗号化キーの選び方、生成した暗号化キー、同期の設定の書き出しと QR、作り直し）。
// 試験用の S3（integration/s3-up.sh、127.0.0.1:18333）の新しい prefix を同期先にする。利用者の本物の同期先には向けない。
// ほかの一覧と違う vault を使うので、runner はこの一覧に新しいページを渡す。

import { REMOTE_FIELDS, newCheckRemoteConfig } from "../checkDevices.mjs";
import { captureWhileScrolling, openSettingsOnDesktop } from "./appOperations.mjs";

const SYNC_SETTINGS_SCROLL_STEPS = 4;

export function SYNC_SCREENS({ baseUrl, passphrase }) {
  return [
    {
      name: "setup-sync-key-choice",
      open: async (page) => {
        const remote = await newCheckRemoteConfig();
        await page.goto(baseUrl);
        await page.getByLabel("パスフレーズ", { exact: true }).fill(passphrase);
        await page.getByLabel("パスフレーズ（確認）").fill(passphrase);
        await page.getByLabel("ほかのデバイスと同期する").check();
        for (const [label, , field] of REMOTE_FIELDS) {
          await page.getByLabel(label).fill(remote[field]);
        }
        await page.getByRole("button", { name: "接続を確認" }).click();
        await page.getByRole("status").filter({ hasText: "空の同期先" }).waitFor();
      },
      close: async () => {},
    },
    {
      name: "dialog-generated-sync-key",
      open: async (page) => {
        await page.getByRole("radio", { name: "自動で生成する" }).click();
        await page.getByRole("button", { name: "作成" }).click();
        await page.getByRole("dialog").waitFor();
      },
      // 控えたことを確かめるチェックを入れてから閉じる。
      close: async (page) => {
        const dialog = page.getByRole("dialog");
        const confirm = dialog.getByRole("checkbox");
        if (await confirm.count()) await confirm.first().check();
        await dialog.getByRole("button").last().click();
        await page.getByRole("button", { name: "新しいメモ" }).waitFor();
      },
    },
    {
      name: "settings-sync-connected",
      capturesItself: true,
      open: async (page, { captureScreen }) => {
        await openSettingsOnDesktop(page, "同期");
        await captureWhileScrolling(page, captureScreen, { name: "settings-sync-connected", scrollContainer: ".settings-layout .document-scroll", maxSteps: SYNC_SETTINGS_SCROLL_STEPS });
      },
      close: async () => {},
    },
    {
      name: "dialog-sync-setup-export",
      open: async (page) => {
        await page.getByRole("button", { name: "同期の設定を書き出す" }).click();
        await page.getByRole("dialog").waitFor();
      },
    },
    {
      // 暗号化キーを作り直す欄（自分で入力するキーを選び、パスフレーズを入れたところ）。作り直しはしない。
      name: "settings-sync-key-replace",
      open: async (page) => {
        await page.getByRole("radio", { name: "自分で入力する" }).click();
        await page.getByLabel("このデバイスのパスフレーズ").fill(passphrase);
        await page.getByLabel("このデバイスのパスフレーズ").scrollIntoViewIfNeeded();
      },
    },
  ];
}

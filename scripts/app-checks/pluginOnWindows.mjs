// Windows の試験用の VM に入れたアプリで、GitHub からプラグインを取り込んで実行できるかを確かめる。
// 手で流す確認の道具。GitHub へ、実際につなぐ。メモを別のウィンドウで開く確認は、確認用のビルドではできないので、
// 配布するビルドで windows/noteWindowInInstalledApp.ps1 を使う。
//
// 前提: windowsVm.mjs の先頭のとおり。
// 使い方: WINDOWS_VM_SSH_KEY=... WINDOWS_VM_USER=... node scripts/app-checks/pluginOnWindows.mjs <画像を置くフォルダ> [取り込み元]

import { PASSPHRASE } from "./checkDevices.mjs";
import { captureScreen, startApp } from "./windowsVm.mjs";

const outputDirectory = process.argv[2];
const pluginSource = process.argv[3] ?? "aida0710/sedum-note/plugins/text-tools";

const { browser, page: app } = await startApp({ fresh: true });
await app.evaluate(`localStorage.setItem("sedum-note:devicePreferences", JSON.stringify({ language: "ja", checkForUpdates: false }))`);
await app.reload();
await app.getByLabel("パスフレーズ", { exact: true }).fill(PASSPHRASE);
await app.getByLabel("パスフレーズ（確認）").fill(PASSPHRASE);
await app.getByRole("button", { name: "作成" }).click();
await app.getByRole("button", { name: "新しいメモ", exact: true }).click();
await app.getByPlaceholder("タイトル").fill("買い物");
await app.getByPlaceholder("タイトル").press("Enter");
await app.keyboard.type("牛乳と卵");

// 1. 設定から、GitHub のプラグインを取り込む。
await app.getByRole("button", { name: "設定", exact: true }).click();
await app.getByRole("navigation", { name: "設定のページ" }).getByRole("button", { name: "プラグイン", exact: true }).click();
await app.locator("#plugin-source").fill(pluginSource);
await app.getByRole("button", { name: "取ってくる" }).click();
await app.getByRole("dialog").getByRole("button", { name: "入れる" }).click({ timeout: 60_000 });
await app.locator(".plugin-list li").first().waitFor();
captureScreen(outputDirectory, "windows-plugin-installed");
console.log("ok: the plugin was fetched from GitHub and installed");

// 2. メモのメニューから、コマンドを実行する。知らせ（文字数）が出れば、ワーカーの中の WebAssembly が動いている。
await app.getByRole("tab", { name: /買い物/ }).click();
await app.getByRole("button", { name: "その他の操作" }).last().click();
await app.getByRole("menuitem", { name: /Count characters/ }).click();
const message = await app.getByRole("status").filter({ hasText: /characters/ }).first().textContent();
captureScreen(outputDirectory, "windows-plugin-message");
console.log(`ok: the plugin command ran in the app (${message})`);
await browser.close();

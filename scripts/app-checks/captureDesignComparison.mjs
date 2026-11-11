// 選ばれた試作（案C、artifacts/design-options/2026-11-10/prototype.html）と同じデータを実装に入れ、
// 同じ大きさ（PC 1280x820、スマホ 390x844）で撮る。ライトとダークの両方。手で流す確認の道具。
//
// 前提: `npx vite --host 127.0.0.1 --port 5173`。同期は使わない。
// 使い方: node scripts/app-checks/captureDesignComparison.mjs <画像を置くフォルダ>

import { chromium } from "@playwright/test";
import { PASSPHRASE, UI_LOCALE } from "./checkDevices.mjs";
import { fillSampleWorkspace } from "./sampleWorkspace.mjs";

const outputDirectory = process.argv[2];

const browser = await chromium.launch();
for (const colorScheme of ["light", "dark"]) {
  const desktop = await (await browser.newContext({ viewport: { width: 1280, height: 820 }, colorScheme, locale: UI_LOCALE })).newPage();
  await fillSampleWorkspace(desktop);
  await desktop.screenshot({ path: `${outputDirectory}/implementation-desktop-${colorScheme}.png` });

  // スマホは同じ保存（同じ origin の IndexedDB）を、狭い画面で開き直して撮る。
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme, locale: UI_LOCALE, storageState: await desktop.context().storageState({ indexedDB: true }) });
  const phone = await phoneContext.newPage();
  await phone.goto("http://127.0.0.1:5173/");
  await phone.getByLabel("パスフレーズ").fill(PASSPHRASE);
  await phone.getByRole("button", { name: "解除" }).click();
  await phone.getByRole("heading", { name: "すべてのメモ" }).waitFor();
  await phone.screenshot({ path: `${outputDirectory}/implementation-mobile-${colorScheme}.png` });
  await phone.getByRole("button", { name: /沖縄旅行の持ち物/ }).click();
  await phone.locator(".ProseMirror").waitFor();
  await phone.screenshot({ path: `${outputDirectory}/implementation-mobile-editor-${colorScheme}.png` });
  await desktop.context().close();
  await phoneContext.close();
}
await browser.close();

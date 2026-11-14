// 操作したときの振動（Android のアプリだけ。src/ui/platform/hapticFeedback.ts）。Web 版では振動を要求せず、設定の欄も出さない。
// Android のアプリで振動を要求することは、scripts/app-checks/hapticFeedbackOnAndroid.mjs でエミュレーターの記録を見て確かめる。

import { expect, test } from "@playwright/test";
import { createNoteOnDesktop, openSettingsPage, startLocalVault } from "./devices";

// 試験が navigator.vibrate を差し替えて、呼ばれた引数を置く所。
type WindowWithVibrateCalls = Window & { vibrateCalls?: unknown[] };

test("Web 版では、チェックボックスや設定のスイッチを押しても振動を要求せず、振動の設定も出ない", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as WindowWithVibrateCalls).vibrateCalls = calls;
    Object.defineProperty(Navigator.prototype, "vibrate", {
      configurable: true,
      value: (pattern: unknown) => {
        calls.push(pattern);
        return true;
      },
    });
  });
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  await page.keyboard.type("[] 牛乳");
  await page.locator('.ProseMirror li[data-checked] input[type="checkbox"]').click();
  await expect(page.locator('.ProseMirror li[data-checked="true"]')).toHaveCount(1);

  await openSettingsPage(page, "一般");
  const typewriterSwitch = page.getByRole("switch", { name: /タイプライターモード/ });
  await typewriterSwitch.click();
  await expect(typewriterSwitch).toBeChecked();
  await expect(page.getByRole("heading", { name: "振動" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "操作したときに振動する" })).toHaveCount(0);

  expect(await page.evaluate(() => (window as WindowWithVibrateCalls).vibrateCalls)).toEqual([]);
});

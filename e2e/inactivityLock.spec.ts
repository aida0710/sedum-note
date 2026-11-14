import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, openSettingsPage, startLocalVault, unlockApp } from "./devices";

// 試験の中の「今」。偽の時計で進める。
const NOW = new Date("2026-11-14T09:00:00+09:00");
const MINUTE = 60_000;

const lockScreen = (page: Page) => page.getByRole("heading", { name: "ロックを解除" });

async function chooseInactivityLock(page: Page, label: string): Promise<void> {
  await openSettingsPage(page, "セキュリティ");
  await page.getByLabel("操作が無いときに自動でロック").selectOption({ label });
}

test("操作が無いまま、選んだ時間が過ぎるとロックする。直前に打った文字も、解除すると残っている", async ({ page }) => {
  await page.clock.install({ time: NOW });
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  await page.keyboard.type("牛乳");
  await chooseInactivityLock(page, "15分");

  await page.clock.fastForward(14 * MINUTE);
  await expect(page.getByRole("button", { name: "新しいメモ" })).toBeVisible();
  await page.clock.fastForward(MINUTE);
  await expect(lockScreen(page)).toBeVisible();

  await unlockApp(page);
  await page.locator(".tree-note", { hasText: "買い物" }).first().click();
  await expect(page.locator(".ProseMirror")).toHaveText("牛乳");
});

test("ほかのウィンドウで操作している間はロックせず、どのウィンドウでも操作が止まってから選んだ時間が過ぎると、全部のウィンドウがロックされる", async ({ page, context }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "日記");
  const opened = context.waitForEvent("page");
  await page.locator(".tree-note", { hasText: "日記" }).first().click({ modifiers: ["ControlOrMeta"] });
  const noteWindow = await opened;
  await expect(noteWindow.getByPlaceholder("タイトル")).toHaveValue("日記");
  // 偽の時計は、別のウィンドウを開いて題が届いてから入れる。偽の時計はページのタイマーを 1 つ呼ぶたびに実時間のタイマーを待つので、
  // 重い CI では元のウィンドウの題の保存の予約が遅れ、別のウィンドウに題が届く前に待ちが切れた（CI で 2 回）。時刻は今のまま進める。
  await page.clock.install();
  await chooseInactivityLock(page, "15分");

  // 10 分後に、別のウィンドウでマウスを動かす。最初のウィンドウでは、そのあと何もしない。
  await page.clock.fastForward(10 * MINUTE);
  await noteWindow.mouse.move(200, 200);
  await noteWindow.mouse.move(240, 260);
  await page.clock.fastForward(10 * MINUTE);
  await expect(lockScreen(page)).toBeHidden();
  await expect(lockScreen(noteWindow)).toBeHidden();

  await page.clock.fastForward(6 * MINUTE);
  await expect(lockScreen(page)).toBeVisible();
  await expect(lockScreen(noteWindow)).toBeVisible();
});

test("「時間を指定」では、分か時間の単位で入れ、Enter で決める。範囲の外や整数でない値は、理由を出して決めない", async ({ page }) => {
  await page.clock.install({ time: NOW });
  await startLocalVault(page);
  await chooseInactivityLock(page, "時間を指定");
  const amount = page.getByLabel("ロックするまでの時間");
  const unit = page.getByLabel("単位");
  const save = page.getByRole("button", { name: "保存" });
  // 選んだだけでは決めない（今の設定のまま）。
  await expect(page.getByText("現在の設定は「しない」です。")).toBeVisible();

  await amount.fill("0");
  await expect(page.getByRole("alert")).toHaveText("1分〜7日（168時間）の時間を入力してください。");
  await expect(save).toBeDisabled();
  await amount.fill("169");
  await unit.selectOption({ label: "時間" });
  await expect(page.getByRole("alert")).toHaveText("1分〜7日（168時間）の時間を入力してください。");
  await amount.fill("1.5");
  await expect(page.getByRole("alert")).toHaveText("整数を入力してください。");

  await unit.selectOption({ label: "分" });
  await amount.fill("90");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await amount.press("Enter");
  await expect(page.getByText("現在の設定は「90分」です。")).toBeVisible();
  await expect(save).toBeDisabled();

  await page.clock.fastForward(89 * MINUTE);
  await expect(lockScreen(page)).toBeHidden();
  await page.clock.fastForward(MINUTE);
  await expect(lockScreen(page)).toBeVisible();

  // 選択肢に無い時間は、開き直しても「時間を指定」の欄に出る。
  await unlockApp(page);
  await openSettingsPage(page, "セキュリティ");
  await expect(page.getByLabel("操作が無いときに自動でロック")).toHaveValue("custom");
  await expect(amount).toHaveValue("90");
  await expect(unit).toHaveValue("minutes");
});

import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, startLocalVault } from "./devices";

// ダイアログと知らせの出入りの動き。ほかの試験は動きを減らす設定で流している（playwright.config.ts）ので、ここだけ外す。
test.use({ contextOptions: { reducedMotion: "no-preference" } });

const noteMenuButton = (page: Page) => page.locator(".pane:not(.split-pane)").getByRole("button", { name: "その他の操作" });

type LeavingRecord = { kind: "added" | "removed"; time: number; inert?: boolean; ariaHidden?: string | null; pointerEvents?: string; animationName?: string };

// 消える写し（.leaving）が足された・外された時刻と、足されたときの様子を記録し始める。
async function recordLeavingCopies(page: Page): Promise<void> {
  await page.evaluate(() => {
    const records: LeavingRecord[] = [];
    (window as unknown as { leavingRecords: LeavingRecord[] }).leavingRecords = records;
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement && node.classList.contains("leaving")) {
            const style = getComputedStyle(node);
            records.push({ kind: "added", time: performance.now(), inert: node.inert, ariaHidden: node.getAttribute("aria-hidden"), pointerEvents: style.pointerEvents, animationName: style.animationName });
          }
        }
        for (const node of mutation.removedNodes) {
          if (node instanceof HTMLElement && node.classList.contains("leaving")) {
            records.push({ kind: "removed", time: performance.now() });
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}

const leavingRecords = (page: Page) => page.evaluate(() => (window as unknown as { leavingRecords: LeavingRecord[] }).leavingRecords);

// 消える写しは、操作を受けず、読み上げにも出ず、消える動きを 100ms ほど流してから外れる。
async function expectCopyFadedOut(page: Page): Promise<void> {
  await expect(page.locator(".leaving")).toHaveCount(0);
  const records = await leavingRecords(page);
  expect(records.map((record) => record.kind)).toEqual(["added", "removed"]);
  expect(records[0]).toMatchObject({ inert: true, ariaHidden: "true", pointerEvents: "none", animationName: "disappear-fade" });
  const shownFor = records[1]!.time - records[0]!.time;
  expect(shownFor).toBeGreaterThanOrEqual(90);
  expect(shownFor).toBeLessThan(1_000);
}

test("ダイアログは透明と少し小さい所から 150ms で現れ、閉じると 100ms で消える。消えている間は操作を受けず、フォーカスは閉じた時点で戻る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "会議");
  await noteMenuButton(page).click();
  await page.getByRole("menuitem", { name: "履歴" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".dialog")).toHaveCSS("animation-name", "appear-rise");
  await expect(page.locator(".dialog")).toHaveCSS("animation-duration", "0.15s");
  await expect(page.locator(".dialog-backdrop")).toHaveCSS("animation-name", "appear-fade");

  await recordLeavingCopies(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(noteMenuButton(page)).toBeFocused();
  await expectCopyFadedOut(page);
});

test("知らせは 150ms で現れ、「元に戻す」で閉じると 100ms で消える", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "会議");
  await noteMenuButton(page).click();
  await page.getByRole("menuitem", { name: "ゴミ箱に移動" }).click();
  const toast = page.getByRole("status").filter({ hasText: "ゴミ箱に移動しました" });
  await expect(toast).toBeVisible();
  await expect(page.locator(".toast")).toHaveCSS("animation-name", "appear-rise");

  await recordLeavingCopies(page);
  await toast.getByRole("button", { name: "元に戻す" }).click();
  await expect(toast).toHaveCount(0);
  await expect(page.locator(".trash-banner")).toBeHidden();
  await expectCopyFadedOut(page);
});

test("コマンドパレットは、出るときも消えるときも動かさない", async ({ page }) => {
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).waitFor();
  await page.keyboard.press("Control+k");
  await expect(page.locator(".dialog.command-palette")).toBeVisible();
  await expect(page.locator(".dialog.command-palette")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".dialog-backdrop")).toHaveCSS("animation-name", "none");

  await recordLeavingCopies(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".dialog.command-palette")).toHaveCount(0);
  // 写しは足しても動きが無いので、足したその場で外れる（足した記録と外した記録が、同じ時刻に対で並ぶ）。
  const records = await leavingRecords(page);
  const added = records.filter((record) => record.kind === "added");
  const removed = records.filter((record) => record.kind === "removed");
  expect(removed).toHaveLength(added.length);
  removed.forEach((record, index) => expect(record.time - added[index]!.time).toBeLessThan(20));
  await expect(page.locator(".leaving")).toHaveCount(0);
});

test.describe("動きを減らす設定", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("動きを減らす設定では、ダイアログも知らせも動かさず、消える写しも残さない", async ({ page }) => {
    await startLocalVault(page);
    await createNoteOnDesktop(page, "会議");
    await noteMenuButton(page).click();
    await page.getByRole("menuitem", { name: "履歴" }).click();
    await expect(page.locator(".dialog")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".dialog-backdrop")).toHaveCSS("animation-name", "none");
    await page.keyboard.press("Escape");
    await expect(page.locator(".dialog-backdrop")).toHaveCount(0);

    await noteMenuButton(page).click();
    await page.getByRole("menuitem", { name: "ゴミ箱に移動" }).click();
    await expect(page.locator(".toast")).toHaveCSS("animation-name", "none");
  });
});

test("ダイアログを閉じた直後でも、ショートカットが効く（消える写しを、開いているダイアログとして数えない）", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "会議");
  await noteMenuButton(page).click();
  await page.getByRole("menuitem", { name: "履歴" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await recordLeavingCopies(page);
  await page.keyboard.press("Escape");
  // 写しが消える前に、コマンドパレットのキーを押す。
  await page.keyboard.press("Control+k");
  await expect(page.getByPlaceholder("メモ・設定・操作を検索（「>」で操作のみ）")).toBeVisible();
  const records = await leavingRecords(page);
  expect(records[0]?.kind).toBe("added");
  // 写しは役割を持たないので、開いているダイアログはパレットの 1 つだけ。
  await expect(page.locator(".leaving [role], .leaving[role]")).toHaveCount(0);
});

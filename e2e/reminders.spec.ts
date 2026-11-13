import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, openSettingsPage, PHONE_VIEWPORT, startLocalVault } from "./devices";

// 試験の中の「今」。期限は、デバイスの時計での日時なので、タイムゾーンを付けずに書く。
const NOW = new Date(2026, 10, 12, 10, 0);

const dueList = (page: Page) => page.locator(".reminders-view");
const group = (page: Page, name: string) => dueList(page).getByRole("region", { name });

async function saveDue(page: Page, dialogName: string, dueAt: string): Promise<void> {
  const dialog = page.getByRole("dialog", { name: dialogName });
  await dialog.getByLabel("日時").fill(dueAt);
  await dialog.getByRole("button", { name: "保存" }).click();
}

test("メモに期限を付けると、期限の一覧に並ぶ。期限を過ぎると「期限切れ」に移り、一覧から外せる", async ({ page }) => {
  await page.clock.install({ time: NOW });
  await startLocalVault(page);
  await createNoteOnDesktop(page, "提出物");
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "メモの期限を設定" }).click();
  await saveDue(page, "メモの期限", "2026-11-12T18:30");
  await expect(page.locator(".due-chip")).toContainText("期限 11月12日 18:30");

  await page.keyboard.press("Control+Alt+e");
  await expect(group(page, "今日")).toContainText("提出物");
  await page.clock.fastForward(9 * 60 * 60_000);
  await expect(group(page, "期限切れ")).toContainText("提出物");

  await dueList(page).getByRole("button", { name: "「提出物」の期限を外す" }).click();
  await expect(dueList(page)).toContainText("期限のあるものはありません");
});

test("「/」の「期限」で、チェックリストの項目に期限の印が付く。一覧からチェックを付けると、本文の項目も完了になる", async ({ page }) => {
  await page.clock.install({ time: NOW });
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  await page.keyboard.type("牛乳を買う");
  await page.keyboard.type(" /きげん");
  await page.getByRole("listbox", { name: "ブロックの種類" }).getByRole("option", { name: "期限（チェックリストの項目に付ける）" }).click();
  await saveDue(page, "項目の期限", "2026-11-13T09:00");
  // 段落だった行は、チェックリストの項目になる。
  await expect(page.locator(".ProseMirror ul[data-type='taskList'] li p")).toHaveText("牛乳を買う 📅 2026-11-13 09:00");
  // 印の絵文字は隠してアイコンを描くので、日時の部分を見る。
  await expect(page.locator(".ProseMirror .due-mark:not(.due-mark-icon)")).toHaveText("2026-11-13 09:00");

  // メニューから開き直すと、今の期限が入っていて、変えられる。
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "この項目の期限を設定" }).click();
  await expect(page.getByRole("dialog", { name: "項目の期限" }).getByLabel("日時")).toHaveValue("2026-11-13T09:00");
  await saveDue(page, "項目の期限", "2026-11-14T08:15");
  await expect(page.locator(".ProseMirror .due-mark:not(.due-mark-icon)")).toHaveText("2026-11-14 08:15");

  await page.clock.runFor(1_000);
  await page.keyboard.press("Control+Alt+e");
  await expect(group(page, "これから")).toContainText("牛乳を買う");
  await expect(group(page, "これから")).toContainText("買い物");
  // 完了にした行は一覧から消えるので、チェックの状態は待たずに押す。
  await dueList(page).getByRole("checkbox", { name: "「牛乳を買う」を完了にする" }).click();
  // 本文の変更は、少し待ってからまとめて保存し、そのときに一覧へ出る。
  await page.clock.runFor(1_000);
  await expect(dueList(page)).toContainText("期限のあるものはありません");
  await dueList(page).getByLabel(/完了も出す/).check();
  await group(page, "完了").locator(".reminder-text", { hasText: "牛乳を買う" }).click();
  await expect(page.locator(".ProseMirror li[data-checked='true']")).toHaveCount(1);
});

test("スマホの画面では、「ノートブック」のタブから期限の一覧を開ける", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill("提出物");
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "メモの期限を設定" }).click();
  await page.getByRole("dialog", { name: "メモの期限" }).getByRole("button", { name: "保存" }).click();
  await page.getByRole("button", { name: "戻る" }).click();

  await page.getByRole("button", { name: "ノートブック", exact: true }).click();
  await page.getByRole("button", { name: /期限の一覧/ }).click();
  await dueList(page).locator(".reminder-text", { hasText: "提出物" }).click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("提出物");
  // メモから戻ると、期限の一覧に戻る。
  await page.getByRole("button", { name: "戻る" }).click();
  await expect(dueList(page)).toBeVisible();
  // 上の行は、ほかの画面と同じ「< 戻る」で、題は画面の左の余白（16px）から始まる。
  expect((await dueList(page).getByRole("heading", { name: "期限の一覧" }).boundingBox())!.x).toBe(16);
  await page.locator(".phone-back", { hasText: "戻る" }).click();
  await expect(page.getByRole("button", { name: /期限の一覧/ })).toBeVisible();
});

type ShownNotification = { title: string; body: string };

// ブラウザの通知を、出した中身を覚えるだけのものに差し替える（試験では OS の通知を出さない）。
async function recordNotifications(page: Page, permission: "granted" | "denied"): Promise<void> {
  await page.addInitScript((grantedPermission) => {
    const shown: ShownNotification[] = [];
    class RecordingNotification {
      static permission = "default";
      static async requestPermission() {
        RecordingNotification.permission = grantedPermission;
        return grantedPermission;
      }
      constructor(title: string, options?: { body?: string }) {
        shown.push({ title, body: options?.body ?? "" });
      }
    }
    Object.assign(window, { Notification: RecordingNotification, shownNotifications: shown });
  }, permission);
}

const shownNotifications = (page: Page) => page.evaluate(() => (window as unknown as { shownNotifications: ShownNotification[] }).shownNotifications);

async function turnOnDueNotifications(page: Page, noteTitle: string): Promise<void> {
  await openSettingsPage(page, "一般");
  await page.getByLabel("期限が来たら通知する").check();
  await page.getByRole("tab", { name: noteTitle }).click();
}

test("期限の通知を入れると、期限が来たときに 1 回だけ通知が出る", async ({ page }) => {
  await recordNotifications(page, "granted");
  await page.clock.install({ time: NOW });
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  await page.keyboard.type("[ ] 牛乳を買う 📅 2026-11-12 10:05");
  await createNoteOnDesktop(page, "日記");
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "メモの期限を設定" }).click();
  await saveDue(page, "メモの期限", "2026-11-12T10:10");
  await turnOnDueNotifications(page, "買い物");

  // 期限の印を打っている途中（時刻をまだ打っていない日付は、朝 9 時の期限として読める）では、通知を出さない。
  await page.locator(".ProseMirror li p").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("卵を買う 📅 2026-11-12");
  await page.clock.runFor(5_000);
  await page.keyboard.type(" 10:05 #夕方");
  // 試験の時計は、進めた分のタイマーを一気に流す。その前に、打った時刻が画面まで届いたこと（本文のタグが上に出る）を待つ。
  await page.clock.runFor(1_000);
  await expect(page.locator(".document-meta .chip", { hasText: "#夕方" })).toBeVisible();
  await page.clock.runFor(4 * 60_000);
  // 設定を入れたときに、確かめの通知が 1 つ出る。
  const confirmation = { title: "期限の通知を入れました", body: "期限が来たら、このように知らせます。" };
  expect(await shownNotifications(page)).toEqual([confirmation]);
  await page.clock.runFor(2 * 60_000);
  const groceries = [
    { title: "牛乳を買う", body: "期限: 11月12日 10:05（買い物）" },
    { title: "卵を買う #夕方", body: "期限: 11月12日 10:05（買い物）" },
  ];
  expect(await shownNotifications(page)).toEqual([confirmation, ...groceries]);
  await page.clock.runFor(10 * 60_000);
  // 知らせた期限の覚えは暗号化しない場所に置くので、項目の文字やメモの題を入れない。
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(/牛乳|卵|買い物/);
  expect(await shownNotifications(page)).toEqual([confirmation, ...groceries, { title: "日記", body: "期限: 11月12日 10:10（日記）" }]);
});

test("通知が許可されなければ、期限の通知は入らず、その旨を出す", async ({ page }) => {
  await recordNotifications(page, "denied");
  await startLocalVault(page);
  await openSettingsPage(page, "一般");
  await page.getByLabel("期限が来たら通知する").click();
  await expect(page.getByRole("alert")).toContainText("通知を出せませんでした");
  await expect(page.getByLabel("期限が来たら通知する")).not.toBeChecked();
});

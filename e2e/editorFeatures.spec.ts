import { expect, type Page, test } from "@playwright/test";
import { newTestRemoteConfig } from "../integration/testStorage";
import { openSyncedDevice, PHONE_VIEWPORT, startLocalVault, syncNowOnDesktop } from "./devices";

async function newNote(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill(title);
  await page.getByPlaceholder("タイトル").press("Enter");
}

async function chooseTableAction(page: Page, action: string): Promise<void> {
  await page.getByRole("button", { name: "表", exact: true }).click();
  await page.getByRole("menuitem", { name: action }).click();
}

const tableShape = (page: Page) => page.evaluate(() => {
  const rows = [...document.querySelectorAll(".ProseMirror table tr")];
  return rows.map((row) => [...row.children].map((cell) => cell.textContent ?? ""));
});

test("2 台で同じ表に行と列を同時に足しても、両方が同じ表になる", async ({ browser }) => {
  const remoteConfig = await newTestRemoteConfig();
  const laptop = await openSyncedDevice(browser, { remoteConfig, join: false });
  await newNote(laptop, "表のメモ");
  await chooseTableAction(laptop, "表を挿入");
  await laptop.keyboard.type("品目");
  await syncNowOnDesktop(laptop, "表のメモ");

  const desk = await openSyncedDevice(browser, { remoteConfig, join: true });
  await desk.getByRole("button", { name: "表のメモ" }).click();
  await expect(desk.locator(".ProseMirror th").first()).toHaveText("品目");

  // 同期の前に、それぞれの手元で表を変える。
  await laptop.locator(".ProseMirror td").first().click();
  await chooseTableAction(laptop, "下に行を追加");
  await laptop.keyboard.type("laptop の行");
  await desk.locator(".ProseMirror td").last().click();
  await chooseTableAction(desk, "右に列を追加");
  await desk.keyboard.type("desk の列");

  await syncNowOnDesktop(laptop, "表のメモ");
  await syncNowOnDesktop(desk, "表のメモ");
  await syncNowOnDesktop(laptop, "表のメモ");

  const shape = await tableShape(laptop);
  expect(await tableShape(desk)).toEqual(shape);
  expect(shape.flat()).toEqual(expect.arrayContaining(["品目", "laptop の行", "desk の列"]));
  // どの行も同じ列の数で、表として崩れていない。
  expect(new Set(shape.map((row) => row.length)).size).toBe(1);
});

test("スマホの幅では、広い表と長いコードの行が画面をはみ出さない。表は表の中で横に送れる", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(page);
  await page.locator(".fab").click();
  await page.getByPlaceholder("タイトル").fill("広い表");
  await page.getByPlaceholder("タイトル").press("Enter");
  await chooseTableAction(page, "表を挿入");
  for (let added = 0; added < 4; added += 1) {
    await chooseTableAction(page, "右に列を追加");
  }
  // 表の後ろの段落へ移ってから、コードのブロックにする。
  await page.keyboard.press("Control+End");
  await page.getByRole("button", { name: "コード", exact: true }).click();
  await page.keyboard.type(`const veryLongLine = "${"x".repeat(200)}";`);

  if (process.env.SCREENSHOT_DIRECTORY) {
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIRECTORY}/phone-table-and-code.png` });
  }
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    scroller: document.querySelector(".document-scroll")!.scrollWidth - document.querySelector(".document-scroll")!.clientWidth,
    table: document.querySelector(".tableWrapper")!.scrollWidth - document.querySelector(".tableWrapper")!.clientWidth,
  }));
  expect(overflow.page).toBe(0);
  expect(overflow.scroller).toBe(0);
  expect(overflow.table).toBeGreaterThan(0);
  // 長いコードの行は折り返す。
  await expect(page.locator(".ProseMirror pre")).toContainText("veryLongLine");
});

test("コードのブロックは、言語を書かなくても色が付く", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "関数の例");
  await page.getByRole("button", { name: "コード", exact: true }).click();
  await page.keyboard.type('function greet(name) { return "hello " + name; } // comment');
  await expect(page.locator(".ProseMirror pre .hljs-keyword").first()).toHaveText("function");
  await expect(page.locator(".ProseMirror pre .hljs-string").first()).toContainText("hello");
});

test("メモへのリンクは、リンク先の今のタイトルを出し、押すと開く。消したリンク先は押せない", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "リンク先");
  await page.keyboard.type("こちらが本体");
  await newNote(page, "リンク元");
  await page.getByRole("button", { name: "メモへのリンク" }).click();
  const picker = page.getByRole("dialog", { name: "リンクするメモを選ぶ" });
  // 自分自身は選べない。
  await expect(picker.getByRole("button", { name: "リンク元" })).toHaveCount(0);
  await picker.getByRole("button", { name: "リンク先" }).click();
  const link = page.locator(".ProseMirror .note-link button");
  await expect(link).toHaveText("リンク先");

  await link.click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("リンク先");
  await page.getByPlaceholder("タイトル").fill("名前を変えた");
  await page.getByRole("tab", { name: "リンク元" }).click();
  await expect(link).toHaveText("名前を変えた");

  await page.getByRole("tab", { name: "名前を変えた" }).click();
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "ゴミ箱に入れる" }).click();
  await page.getByRole("tab", { name: "リンク元" }).click();
  await expect(link).toHaveText("名前を変えた（ゴミ箱）");

  await link.click();
  await page.getByRole("button", { name: "完全に削除" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "完全に削除" }).click();
  await page.getByRole("tab", { name: "リンク元" }).click();
  await expect(link).toHaveText("削除されたメモ");
  await expect(link).toBeDisabled();
});

test("履歴から、書き直す前の状態を別のメモとして復元できる", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-11T09:00:00+09:00") });
  await startLocalVault(page);
  await newNote(page, "議事録");
  await page.keyboard.type("書き直す前の文");
  await page.clock.runFor(1_000);

  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "履歴" }).click();
  await expect(page.getByRole("dialog", { name: "履歴" })).toContainText("まだ履歴がありません");
  await page.getByRole("dialog", { name: "履歴" }).getByRole("button", { name: "閉じる" }).click();

  // 間隔（10 分）が空いてからの編集で、編集の前の状態が残る。
  await page.clock.runFor(11 * 60_000);
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("書き直した文");
  await page.clock.runFor(1_000);

  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "履歴" }).click();
  const history = page.getByRole("dialog", { name: "履歴" });
  await expect(history.getByRole("option")).toHaveCount(1);
  await expect(history.locator(".note-history-preview")).toContainText("書き直す前の文");
  await history.getByRole("button", { name: "別のメモとして復元" }).click();

  await expect(page.getByPlaceholder("タイトル")).toHaveValue(/^議事録（.+ の版）$/);
  await expect(page.locator(".ProseMirror")).toHaveText("書き直す前の文");
  await page.getByRole("tab", { name: "議事録", exact: true }).click();
  await expect(page.locator(".ProseMirror")).toHaveText("書き直した文");
});

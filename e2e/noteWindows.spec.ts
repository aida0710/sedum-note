import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { newTestRemoteConfig } from "../integration/testStorage";
import { createNoteOnDesktop, openSyncedDevice, placeCursorAtBodyEnd, startLocalVault, startSyncedVault, syncNowOnDesktop, unlockApp } from "./devices";

const lockScreen = (page: Page) => page.getByRole("heading", { name: "ロックを解除" });

// 左の列のメモを Ctrl+クリックして、開いた別のウィンドウを返す。
async function openNoteWindowByCtrlClick(page: Page, context: BrowserContext, title: string): Promise<Page> {
  const opened = context.waitForEvent("page");
  await page.locator(".tree-note", { hasText: title }).first().click({ modifiers: ["ControlOrMeta"] });
  return opened;
}

test("同じメモを 2 つのタブで開いて書いても、どちらの文字も両方に出て、開き直しても残る", async ({ page, context }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "議事録");
  await page.keyboard.type("1 つ目のタブの行");

  const secondTab = await context.newPage();
  await secondTab.goto("/");
  await unlockApp(secondTab);
  await secondTab.locator(".tree-note", { hasText: "議事録" }).first().click();
  await expect(secondTab.locator(".ProseMirror")).toHaveText("1 つ目のタブの行");
  await placeCursorAtBodyEnd(secondTab);
  await secondTab.keyboard.press("Enter");
  await secondTab.keyboard.type("2 つ目のタブの行");
  await expect(page.locator(".ProseMirror p")).toHaveText(["1 つ目のタブの行", "2 つ目のタブの行"]);

  // 1 つ目のタブで続けて書いても、2 つ目のタブの行は消えない。
  await placeCursorAtBodyEnd(page);
  await page.keyboard.type("（追記）");
  await expect(secondTab.locator(".ProseMirror p")).toHaveText(["1 つ目のタブの行", "2 つ目のタブの行（追記）"]);
  await page.reload();
  await unlockApp(page);
  await page.locator(".tree-note", { hasText: "議事録" }).first().click();
  await expect(page.locator(".ProseMirror p")).toHaveText(["1 つ目のタブの行", "2 つ目のタブの行（追記）"]);
});

test("メモを別のウィンドウで開くと、パスフレーズを聞かずに、そのメモだけが出る。書いた文字は元のウィンドウにも出る", async ({ page, context }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  await page.keyboard.type("牛乳");
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  const opened = context.waitForEvent("page");
  await page.getByRole("menuitem", { name: "別のウィンドウで開く" }).click();
  const noteWindow = await opened;

  await expect(noteWindow.getByPlaceholder("タイトル")).toHaveValue("買い物");
  await expect(noteWindow.locator(".ProseMirror")).toHaveText("牛乳");
  await expect(noteWindow.locator(".sidebar")).toBeHidden();
  await expect(noteWindow.getByRole("tablist")).toBeHidden();
  await expect(noteWindow).toHaveTitle("買い物");

  await placeCursorAtBodyEnd(noteWindow);
  await noteWindow.keyboard.type("と卵");
  await expect(page.locator(".ProseMirror")).toHaveText("牛乳と卵");
});

test("左の列のメモを Ctrl+クリックすると、そのメモを別のウィンドウで、パスフレーズを聞かずに開く。元のウィンドウのタブは増えない", async ({ page, context }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "旅の予定");
  await page.keyboard.type("宿を取る");
  await createNoteOnDesktop(page, "別のメモ");
  const tabsBefore = await page.getByRole("tab").count();

  const noteWindow = await openNoteWindowByCtrlClick(page, context, "旅の予定");
  await expect(noteWindow.getByPlaceholder("タイトル")).toHaveValue("旅の予定");
  await expect(noteWindow.locator(".ProseMirror")).toHaveText("宿を取る");
  await expect(page.getByRole("tab")).toHaveCount(tabsBefore);
  await expect(page.locator(".tree-note.selected")).toHaveCount(0);
});

test("同期は片方のタブだけが行い、もう片方のタブで書いた文字も、ほかのデバイスへ届く", async ({ page, context, browser }) => {
  const remoteConfig = await newTestRemoteConfig();
  await startSyncedVault(page, { remoteConfig, join: false });
  await createNoteOnDesktop(page, "共有メモ");
  await page.keyboard.type("1 つ目のタブ");

  const secondTab = await context.newPage();
  await secondTab.goto("/");
  await unlockApp(secondTab);
  await expect(secondTab.locator(".sync-line")).toHaveText("別のウィンドウが同期しています");
  await secondTab.locator(".tree-note", { hasText: "共有メモ" }).first().click();
  await placeCursorAtBodyEnd(secondTab);
  await secondTab.keyboard.type("と 2 つ目のタブ");
  await expect(secondTab.locator(".ProseMirror")).toHaveText("1 つ目のタブと 2 つ目のタブ");
  // 2 つ目のタブの文字が 1 つ目のタブに届いたら、1 つ目のタブ（同期の受け持ち）から送る。
  await expect(page.locator(".ProseMirror")).toHaveText("1 つ目のタブと 2 つ目のタブ");
  await syncNowOnDesktop(page, "共有メモ");

  const otherDevice = await openSyncedDevice(browser, { remoteConfig, join: true });
  await otherDevice.locator(".tree-note", { hasText: "共有メモ" }).first().click();
  await expect(otherDevice.locator(".ProseMirror")).toHaveText("1 つ目のタブと 2 つ目のタブ");

  // 同期していたタブを閉じると、残ったタブが同期を引き継ぐ。
  await page.close();
  await expect(secondTab.locator(".sync-line")).not.toHaveText("別のウィンドウが同期しています");
});

test("1 つのウィンドウでロックすると、別のウィンドウもロックされる", async ({ page, context }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "日記");
  await page.keyboard.type("今日のこと");
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  const opened = context.waitForEvent("page");
  await page.getByRole("menuitem", { name: "別のウィンドウで開く" }).click();
  const noteWindow = await opened;
  await expect(noteWindow.locator(".ProseMirror")).toHaveText("今日のこと");
  // 別のウィンドウで打ったばかりの文字も、ロックの前に保存される。
  await placeCursorAtBodyEnd(noteWindow);
  await noteWindow.keyboard.type("、続き");

  await page.keyboard.press("Control+l");
  await expect(lockScreen(page)).toBeVisible();
  await expect(lockScreen(noteWindow)).toBeVisible();
  await expect(noteWindow.getByText("今日のこと")).toHaveCount(0);

  await unlockApp(page);
  await page.locator(".tree-note", { hasText: "日記" }).first().click();
  await expect(page.locator(".ProseMirror")).toHaveText("今日のこと、続き");
});

test("ロックしたあとに別のウィンドウで解除すると、開いた元のウィンドウも解除される。元のウィンドウで解除すると、別のウィンドウも解除される。ほかのタブは解除されない", async ({ page, context }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "予定");
  const noteWindow = await openNoteWindowByCtrlClick(page, context, "予定");
  await expect(noteWindow.getByPlaceholder("タイトル")).toHaveValue("予定");
  // アプリが開いたのではないタブは、元のウィンドウが解除していても、自分で解除する。
  const otherTab = await context.newPage();
  await otherTab.goto("/");
  await expect(lockScreen(otherTab)).toBeVisible();

  await page.keyboard.press("Control+l");
  await expect(lockScreen(page)).toBeVisible();
  await expect(lockScreen(noteWindow)).toBeVisible();
  await unlockApp(noteWindow);
  await expect(noteWindow.getByPlaceholder("タイトル")).toHaveValue("予定");
  await expect(page.locator(".tree-note", { hasText: "予定" })).toBeVisible();

  await page.keyboard.press("Control+l");
  await expect(lockScreen(noteWindow)).toBeVisible();
  await unlockApp(page);
  await expect(page.locator(".tree-note", { hasText: "予定" })).toBeVisible();
  await expect(noteWindow.getByPlaceholder("タイトル")).toHaveValue("予定");
  await expect(lockScreen(otherTab)).toBeVisible();
});

// ページの中で、受け取った知らせを覚える。キー（CryptoKey）がどこかに入っていたかも見る。
type HeardMessage = { from: string; containsKey: boolean; data: unknown };

test("同じ出どころの、アプリが開いたのではないページは、合図の通り道を聞いていても、キーを受け取れない", async ({ page, context }) => {
  // 同じ出どころの空のページ（アプリを読み込まない）。開発サーバーは知らないパスにもアプリを返すので、試験の中で中身を返す。
  await context.route("**/unrelated-page.html", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>unrelated</title>" }));
  const unrelated = await context.newPage();
  await unrelated.goto("/unrelated-page.html");
  // ロックの合図の通り道（platform/crossWindowStorage.ts）と、アプリ（Tauri）がキーを運ぶ通り道（platform/appWindowsKeyTransport.ts）を聞く。
  await unrelated.evaluate((channelNames) => {
    const containsKey = (value: unknown): boolean =>
      value instanceof CryptoKey || (typeof value === "object" && value !== null && Object.values(value).some(containsKey));
    const heard: HeardMessage[] = [];
    Object.assign(window, { heard });
    for (const name of channelNames) {
      new BroadcastChannel(name).addEventListener("message", (event: MessageEvent<unknown>) => {
        heard.push({ from: name, containsKey: containsKey(event.data), data: event.data });
      });
    }
    window.addEventListener("message", (event) => heard.push({ from: "postMessage", containsKey: containsKey(event.data), data: event.data }));
  }, ["sedum-note:windows", "sedum-note:unlocked-keys"]);

  await startLocalVault(page);
  await createNoteOnDesktop(page, "秘密のメモ");
  const noteWindow = await openNoteWindowByCtrlClick(page, context, "秘密のメモ");
  await expect(noteWindow.getByPlaceholder("タイトル")).toHaveValue("秘密のメモ");
  await page.keyboard.press("Control+l");
  await expect(lockScreen(noteWindow)).toBeVisible();
  await unlockApp(noteWindow);
  await expect(page.locator(".tree-note", { hasText: "秘密のメモ" })).toBeVisible();
  // アプリ（Tauri）の通り道でキーを頼んでも、Web 版のウィンドウは答えない。頼んだあとにもう 1 度ロックして、返事が届く時間をおく。
  await unrelated.evaluate(() => new BroadcastChannel("sedum-note:unlocked-keys")
    .postMessage({ app: "sedum-note:unlocked-key", kind: "keyRequest", spaceId: "first", requestId: "0123456789abcdef0123456789abcdef" }));
  await page.keyboard.press("Control+l");
  await expect(lockScreen(noteWindow)).toBeVisible();

  // ロックの合図は 2 回とも聞こえている（聞けていることの確かめ）が、キーの入った知らせは 1 つも届いていない。
  const heardMessages = () => unrelated.evaluate(() => (window as unknown as { heard: HeardMessage[] }).heard);
  await expect.poll(async () => (await heardMessages()).filter((message) => message.data === "lock").length).toBe(2);
  const heard = await heardMessages();
  expect(heard.filter((message) => message.containsKey)).toEqual([]);
  expect(heard.filter((message) => message.from === "postMessage")).toEqual([]);
  // アプリの通り道に流れたのは、上でこのページが送った頼みだけ。
  expect(heard.filter((message) => message.from === "sedum-note:unlocked-keys").map((message) => (message.data as { kind: string }).kind)).toEqual(["keyRequest"]);
});

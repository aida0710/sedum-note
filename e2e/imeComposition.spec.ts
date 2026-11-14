import { type CDPSession, expect, type Page, test } from "@playwright/test";
import { newTestRemoteConfig } from "../integration/testStorage";
import { createNoteOnDesktop, insertBodyHtml, openSyncedDevice, placeCursorInBlock, startLocalVault } from "./devices";

// 日本語の変換中（未確定の文字がある間）に、ほかのデバイスの変更が同じ段落へマージされても、
// 変換が壊れず、確定した文字とほかのデバイスの文字の両方が残ることを確かめる。
// 変換は Chromium の DevTools の Input.imeSetComposition で作る。
test("日本語の変換中に、ほかのデバイスの変更が同じ段落に入っても、変換した文字が残る", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "変換は Chromium の DevTools で作る");
  const remoteConfig = await newTestRemoteConfig();
  const open = (join: boolean) => openSyncedDevice(browser, { remoteConfig, join });

  const laptop = await open(false);
  await laptop.getByRole("button", { name: "新しいメモ" }).click();
  await laptop.getByPlaceholder("タイトル").fill("変換の確認");
  await laptop.getByPlaceholder("タイトル").press("Enter");
  await laptop.keyboard.type("最初の文。");
  await expect(laptop.getByText(/同期済み/)).toBeVisible({ timeout: 20_000 });
  await laptop.waitForTimeout(3_000);

  const phone = await open(true);
  await phone.getByRole("button", { name: /変換の確認/ }).first().click();
  await expect(phone.locator(".ProseMirror")).toContainText("最初の文。");

  // PC は段落の末尾で変換を始め、未確定の「にほんご」を持ったままにする。
  await laptop.locator(".ProseMirror").getByText("最初の文。").click();
  await laptop.keyboard.press("End");
  const devTools = await laptop.context().newCDPSession(laptop);
  await devTools.send("Input.imeSetComposition", { text: "にほんご", selectionStart: 4, selectionEnd: 4 });

  // その間に、スマホが同じ段落の先頭へ書き足して送る。PC は「今すぐ同期」の代わりに、
  // 画面に戻ったときの同期（visibilitychange）で取り込む。
  await phone.locator(".ProseMirror").getByText("最初の文。").click();
  await phone.keyboard.press("Home");
  await phone.keyboard.type("スマホの文。");
  await expect(phone.getByText(/同期済み/)).toBeVisible({ timeout: 20_000 });
  await phone.waitForTimeout(3_000);
  await laptop.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(laptop.locator(".ProseMirror")).toContainText("スマホの文。", { timeout: 20_000 });

  // 変換を確定する。
  await devTools.send("Input.insertText", { text: "日本語" });
  await expect(laptop.locator(".ProseMirror")).toContainText("スマホの文。最初の文。日本語");
  await expect(laptop.locator(".ProseMirror")).not.toContainText("にほんご");
  await expect(laptop.getByText(/同期済み/)).toBeVisible({ timeout: 20_000 });
});

// 変換を確定する Enter の届き方は 2 通りある。Chromium は変換中（isComposing）として届け、
// WebKit は変換の終了のあとに、keyCode 229 のまま届ける。どちらも入力の確定にしない。
const IME_CONFIRM_ENTERS = [
  { name: "変換中として届く Enter", init: { key: "Enter", keyCode: 229, isComposing: true } },
  { name: "変換の終了のあとに届く Enter", init: { key: "Enter", keyCode: 229, isComposing: false } },
];

for (const confirmEnter of IME_CONFIRM_ENTERS) {
  test(`${confirmEnter.name}では、タイトルから本文へ移らず、ノートブックの名前も決まらない`, async ({ page }) => {
    await startLocalVault(page);
    const pressImeConfirmEnter = () => page.evaluate((init) => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true }));
    }, confirmEnter.init);

    await page.getByRole("button", { name: "新しいメモ" }).click();
    const title = page.getByPlaceholder("タイトル");
    await title.fill("かいぎ");
    await pressImeConfirmEnter();
    await expect(title).toBeFocused();

    await page.getByRole("button", { name: "ノートブックを追加" }).click();
    const notebookName = page.getByPlaceholder("ノートブックの名前");
    await notebookName.fill("しごと");
    await pressImeConfirmEnter();
    await expect(notebookName).toBeFocused();
    // 変換していないときの Enter では決まる。
    await notebookName.press("Enter");
    await expect(notebookName).toHaveCount(0);
    await expect(page.getByRole("button", { name: "しごと" })).toBeVisible();
  });
}

// 変換を確定する Enter（Chromium は変換中として届ける）を、今フォーカスのある要素へ送る。
async function pressImeConfirmEnter(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, isComposing: true, bubbles: true, cancelable: true }));
  });
}

// 未確定の「にほんご」を作り、変換を確定する Enter のあとに「日本語」で確定する（実際の日本語入力と同じ順）。
async function composeAndConfirm(page: Page, devTools: CDPSession): Promise<void> {
  await devTools.send("Input.imeSetComposition", { text: "にほんご", selectionStart: 4, selectionEnd: 4 });
  await pressImeConfirmEnter(page);
  await devTools.send("Input.insertText", { text: "日本語" });
}

const blockCounts = (page: Page) => page.locator(".ProseMirror").evaluate((body) => ({
  quotes: body.querySelectorAll("blockquote").length, cells: body.querySelectorAll("td, th").length, rows: body.querySelectorAll("tr").length,
  callouts: body.querySelectorAll("[data-callout]").length, paragraphs: body.querySelectorAll("p").length,
}));

// 変換と確定を、ブロックの中で行う。確定した文字はそのブロックに入り、未確定の文字は残らず、ブロックの数も変わらない。
const COMPOSING_BLOCKS = [
  { name: "引用", html: "<blockquote><p>引用の文</p></blockquote>", text: "引用の文", block: ".ProseMirror blockquote" },
  { name: "表のセル", html: "<table><tbody><tr><td><p>左のセル</p></td><td><p>右のセル</p></td></tr></tbody></table>", text: "左のセル", block: ".ProseMirror td >> nth=0" },
  { name: "コールアウト", html: '<div data-callout="note"><p>コールアウトの文</p></div>', text: "コールアウトの文", block: ".ProseMirror [data-callout]" },
];

for (const composing of COMPOSING_BLOCKS) {
  test(`${composing.name}の中で変換して確定すると、確定した文字は${composing.name}に入り、ブロックは分かれない`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "変換は Chromium の DevTools で作る");
    await startLocalVault(page);
    await createNoteOnDesktop(page, "変換の場所");
    await insertBodyHtml(page, `${composing.html}<p>下の段落</p>`);
    const before = await blockCounts(page);
    await placeCursorInBlock(page, composing.text, "end");
    await composeAndConfirm(page, await page.context().newCDPSession(page));
    await expect(page.locator(composing.block)).toHaveText(`${composing.text}日本語`);
    await expect(page.locator(".ProseMirror")).not.toContainText("にほんご");
    expect(await blockCounts(page)).toEqual(before);
  });
}

// 日本語入力のままの「＃」「＞」は、変換を確定して入り、続けて打った全角の空白で書式に変わる（実際の日本語入力と同じ順）。
for (const shortcut of [{ mark: "＃", block: "h1" }, { mark: "＃＃", block: "h2" }, { mark: "＞", block: "blockquote" }]) {
  test(`変換して確定した「${shortcut.mark}」のあとの全角の空白で、書式に変わる`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "変換は Chromium の DevTools で作る");
    await startLocalVault(page);
    await createNoteOnDesktop(page, "変換の書式");
    const devTools = await page.context().newCDPSession(page);
    await devTools.send("Input.imeSetComposition", { text: shortcut.mark, selectionStart: shortcut.mark.length, selectionEnd: shortcut.mark.length });
    await pressImeConfirmEnter(page);
    await devTools.send("Input.insertText", { text: shortcut.mark });
    await page.keyboard.type("　書式の文");
    await expect(page.locator(`.ProseMirror ${shortcut.block}`)).toHaveText("書式の文");
  });
}

test("たたんだ見出しの行で変換して確定すると、見出しはたたんだまま、隠れた中身も変わらない", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "変換は Chromium の DevTools で作る");
  await startLocalVault(page);
  await createNoteOnDesktop(page, "たたんだ見出し");
  await insertBodyHtml(page, "<h2>たたむ見出し</h2><p>隠れる中身</p><h2>次の見出し</h2>");
  const heading = page.locator(".ProseMirror h2", { hasText: "たたむ見出し" });
  await heading.hover();
  await heading.getByRole("button", { name: "折りたたむ" }).click();
  await expect(page.locator(".ProseMirror p", { hasText: "隠れる中身" })).toBeHidden();
  await placeCursorInBlock(page, "たたむ見出し", "end");
  await composeAndConfirm(page, await page.context().newCDPSession(page));
  await expect(heading).toHaveText("たたむ見出し日本語");
  await expect(page.locator(".ProseMirror p", { hasText: "隠れる中身" })).toBeHidden();
  await expect(page.locator(".ProseMirror p")).toHaveText(["隠れる中身", ""]);
  await expect(page.locator(".ProseMirror h2")).toHaveCount(2);
});

test("「/」の候補は変換中のかなでも絞り込め、変換を確定する Enter では選ばれない。確定したあとの Enter で選ぶ", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "変換は Chromium の DevTools で作る");
  await startLocalVault(page);
  await createNoteOnDesktop(page, "候補の変換");
  await page.keyboard.type("/");
  const candidates = page.getByRole("listbox", { name: "ブロックの種類" });
  await expect(candidates).toBeVisible();
  const devTools = await page.context().newCDPSession(page);
  await devTools.send("Input.imeSetComposition", { text: "ひょう", selectionStart: 3, selectionEnd: 3 });
  await expect(candidates.getByRole("option", { name: "表", exact: true })).toBeVisible();
  await pressImeConfirmEnter(page);
  await devTools.send("Input.insertText", { text: "ひょう" });
  await expect(page.locator(".ProseMirror table")).toHaveCount(0);
  await expect(candidates.getByRole("option", { name: "表", exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".ProseMirror table")).toHaveCount(1);
  await expect(page.locator(".ProseMirror")).not.toContainText("ひょう");
});

test("変換中に押したキーでは、本文のショートカット（Ctrl+D の複製）も画面全体のショートカット（Ctrl+K）も動かない", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "変換は Chromium の DevTools で作る");
  await startLocalVault(page);
  await createNoteOnDesktop(page, "変換中のキー");
  await page.keyboard.type("一行目");
  const devTools = await page.context().newCDPSession(page);
  await devTools.send("Input.imeSetComposition", { text: "にほんご", selectionStart: 4, selectionEnd: 4 });
  // 変換中のキーは、ブラウザが isComposing を付けて届ける。
  for (const key of ["d", "k"]) {
    await page.evaluate((pressed) => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: pressed, code: `Key${pressed.toUpperCase()}`, ctrlKey: true, keyCode: 229, isComposing: true, bubbles: true, cancelable: true }));
    }, key);
  }
  await devTools.send("Input.insertText", { text: "日本語" });
  await expect(page.locator(".ProseMirror p")).toHaveText(["一行目日本語"]);
  await expect(page.getByRole("dialog", { name: "コマンドパレット" })).toHaveCount(0);
});

for (const confirmEnter of IME_CONFIRM_ENTERS) {
  test(`左の列でメモの名前を変えている間、${confirmEnter.name}では名前が決まらない`, async ({ page }) => {
    await startLocalVault(page);
    await createNoteOnDesktop(page, "かいもの");
    await page.locator(".sidebar .tree-note", { hasText: "かいもの" }).first().dblclick();
    const nameInput = page.locator(".sidebar .inline-input");
    await nameInput.fill("しゅうまつのかいもの");
    await nameInput.evaluate((input, init) => {
      input.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true }));
    }, confirmEnter.init);
    await expect(nameInput).toBeFocused();
    await nameInput.press("Enter");
    await expect(nameInput).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "しゅうまつのかいもの" })).toBeVisible();
  });
}

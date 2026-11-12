import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, startLocalVault } from "./devices";

async function newNote(page: Page, title: string, body: string): Promise<void> {
  await createNoteOnDesktop(page, title);
  await page.keyboard.type(body);
}

test("Ctrl+F でメモの中を検索でき、当たりに色が付いて、Enter で次の当たりへ移る", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "検索の試し", "りんご と みかん。りんご の木。");
  await page.keyboard.press("Control+f");
  const find = page.getByRole("search");
  await find.getByRole("textbox").fill("りんご");
  await expect(page.locator(".ProseMirror .search-match")).toHaveCount(2);
  await expect(find).toContainText("1 / 2");
  await find.getByRole("textbox").press("Enter");
  await expect(find).toContainText("2 / 2");
  await expect(page.locator(".ProseMirror .search-match.active")).toHaveCount(1);
  await find.getByRole("textbox").press("Escape");
  await expect(page.getByRole("search")).toHaveCount(0);
  await expect(page.locator(".ProseMirror .search-match")).toHaveCount(0);
  // 色は表示だけで、本文は変わっていない。
  await expect(page.locator(".ProseMirror")).toHaveText("りんご と みかん。りんご の木。");
});

test("一覧の検索で開いたメモは、探した言葉に色が付く。ノートブックを開いていれば、まずその中を探す", async ({ page }) => {
  await startLocalVault(page);
  await page.getByRole("button", { name: "ノートブックを追加" }).click();
  await page.getByPlaceholder("ノートブックの名前").fill("旅行");
  await page.getByPlaceholder("ノートブックの名前").press("Enter");
  await newNote(page, "ノートブックの外", "持ち物の一覧");
  await page.getByRole("button", { name: /^旅行/ }).click();
  await newNote(page, "沖縄", "持ち物は水着");

  await page.keyboard.press("Control+Shift+f");
  await page.getByPlaceholder("メモを検索").fill("持ち物");
  await expect(page.getByText("検索結果（1件）")).toBeVisible();
  await page.getByRole("button", { name: /「旅行」の中を検索しています/ }).click();
  await expect(page.getByText("検索結果（2件）")).toBeVisible();
  await page.locator(".tree-note", { hasText: "ノートブックの外" }).click();
  await expect(page.locator(".ProseMirror .search-match")).toHaveText("持ち物");
});

test("ショートカットで、新しいメモ・タブの切り替え・タブを閉じる・設定ができる。ダイアログが開いている間は効かない", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "1 つ目", "");
  await page.keyboard.press("Control+Alt+n");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.getByPlaceholder("タイトル").fill("2 つ目");

  await page.keyboard.press("Control+Alt+ArrowLeft");
  await expect(page.getByRole("tab", { selected: true })).toHaveText("1 つ目");
  await page.keyboard.press("Control+Alt+ArrowRight");
  await expect(page.getByRole("tab", { selected: true })).toHaveText("2 つ目");
  await page.keyboard.press("Control+Alt+w");
  await expect(page.getByRole("tab")).toHaveText(["1 つ目"]);

  await page.keyboard.press("Control+,");
  await expect(page.getByRole("heading", { name: "キーボードショートカット" })).toBeVisible();
  await expect(page.locator(".shortcut-list").first()).toContainText("Ctrl + Alt + N");
  await expect(page.locator(".shortcut-list").last()).toContainText("Ctrl + Alt + Enter");

  await page.getByRole("button", { name: "このデバイスのデータを消す" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Control+Alt+n");
  await expect(page.getByRole("tab")).toHaveCount(2);
});

test("メモの中の言葉を、1 つずつ、または全部まとめて置換できる。全部の置換は 1 回の取り消しで戻る", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "置換の試し", "りんご と みかん。りんご の木。りんご の実。");
  await page.keyboard.press("Control+f");
  await page.getByPlaceholder("このメモの中を検索").fill("りんご");
  await page.getByRole("button", { name: "置換", exact: true }).first().click();
  await page.getByPlaceholder("置換後の言葉").fill("もも");

  const body = page.locator(".ProseMirror");
  await page.getByRole("button", { name: "置換", exact: true }).last().click();
  await expect(body).toHaveText("もも と みかん。りんご の木。りんご の実。");
  await page.getByRole("button", { name: "すべて置換" }).click();
  await expect(body).toHaveText("もも と みかん。もも の木。もも の実。");

  await body.click();
  await page.keyboard.press("Control+z");
  await expect(body).toHaveText("もも と みかん。りんご の木。りんご の実。");
});

test("本文の文字数が出て、選んでいる間は選んだ範囲の文字数も出る", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "文字数の試し", "あいう えお");
  await expect(page.locator(".character-count")).toHaveText("5 文字");
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(page.locator(".character-count")).toHaveText("選択 2 / 5 文字");
});

test("「/」のメニューとショートカットで、今日の日付を本文に入れられる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "日付の試し", "");
  const today = await page.evaluate(() => new Intl.DateTimeFormat("ja", { dateStyle: "long" }).format(new Date()));
  await page.keyboard.type("/きょう");
  await page.keyboard.press("Enter");
  await expect(page.locator(".ProseMirror")).toHaveText(today);
  await page.keyboard.press("Control+Alt+d");
  await expect(page.locator(".ProseMirror")).toHaveText(today + today);
});

test("デイリーノートのボタンで今日のメモを作り、もう一度押すと同じメモが開く。入れるノートブックは設定で選べる", async ({ page }) => {
  await startLocalVault(page);
  const today = await page.evaluate(() => {
    const now = new Date();
    const twoDigits = (value: number) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
  });
  await page.getByRole("button", { name: "今日のメモ（デイリーノート）" }).click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue(today);
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("朝の記録");

  await page.keyboard.press("Control+Alt+n");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.keyboard.press("Control+Alt+j");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByPlaceholder("タイトル")).toHaveValue(today);
  await expect(page.locator(".ProseMirror")).toHaveText("朝の記録");
});

test("フォーカスモードでは左の列・タブ・ツールバーが隠れ、ボタンかショートカットで戻る", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "集中して書く", "本文");
  await page.getByRole("button", { name: "フォーカスモード", exact: true }).click();
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".tabs")).toBeHidden();
  await expect(page.locator(".editor-bar")).toBeHidden();
  await expect(page.locator(".ProseMirror")).toHaveText("本文");

  await page.getByRole("button", { name: "フォーカスモードを終わる" }).click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.keyboard.press("Control+Alt+f");
  await expect(page.locator(".sidebar")).toBeHidden();
});

test("タイプライターモードでは、打っている行が本文の領域の中央あたりに保たれる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "長いメモ", "");
  await page.keyboard.press("Control+Alt+Shift+f");
  for (let line = 0; line < 40; line += 1) {
    await page.keyboard.type(`${line} 行目`);
    await page.keyboard.press("Enter");
  }
  const offsetFromCenter = await page.evaluate(() => {
    const area = document.querySelector(".document-scroll")!.getBoundingClientRect();
    const caret = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
    const lastLine = caret.height > 0 ? caret : document.querySelector(".ProseMirror")!.lastElementChild!.getBoundingClientRect();
    return Math.abs((lastLine.top + lastLine.bottom) / 2 - (area.top + area.height / 2));
  });
  expect(offsetFromCenter).toBeLessThan(40);
});

test("コマンドパレットで、メモを題で探して開ける。「>」で始めると操作を探して実行できる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "会議の記録", "");
  await newNote(page, "買い物リスト", "");
  await page.keyboard.press("Control+Alt+k");
  const palette = page.getByRole("dialog", { name: "コマンドパレット" });
  await palette.getByRole("combobox").fill("会議");
  await expect(palette.getByRole("option")).toHaveText(["会議の記録"]);
  await page.keyboard.press("Enter");
  await expect(palette).toHaveCount(0);
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("会議の記録");

  await page.keyboard.press("Control+Alt+k");
  await palette.getByRole("combobox").fill(">フォーカス");
  await expect(palette.getByRole("option")).toContainText(["フォーカスモード"]);
  await page.keyboard.press("Enter");
  await expect(page.locator(".sidebar")).toBeHidden();
});

test("検索を名前を付けて保存でき、左の列から同じ検索を開ける。消すこともできる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "旅行の持ち物", "パスポート");
  await newNote(page, "買い物", "牛乳");
  await page.keyboard.press("Control+Shift+f");
  await page.getByPlaceholder("メモを検索").fill("パスポート");
  await expect(page.getByText("検索結果（1件）")).toBeVisible();
  await page.getByRole("button", { name: "この検索を保存" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("旅の準備");
  await page.keyboard.press("Enter");

  await page.getByPlaceholder("メモを検索").fill("");
  const savedSearch = page.getByRole("button", { name: "旅の準備", exact: true });
  await savedSearch.click();
  await expect(page.getByPlaceholder("メモを検索")).toHaveValue("パスポート");
  await expect(page.getByText("検索結果（1件）")).toBeVisible();

  await page.getByPlaceholder("メモを検索").fill("");
  await savedSearch.hover();
  await page.getByRole("button", { name: "保存した検索「旅の準備」を消す" }).click();
  await expect(savedSearch).toHaveCount(0);
});

import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, selectSettingsPage, startLocalVault } from "./devices";

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
  const scope = page.getByRole("radiogroup", { name: "検索する範囲" });
  await expect(scope.getByRole("radio", { name: "「旅行」の中" })).toBeChecked();
  await scope.getByRole("radio", { name: "すべてのメモ" }).click();
  await expect(page.getByText("検索結果（2件）")).toBeVisible();
  // 検索の結果には、本文の中で当たった所を、前後の文と一緒に出す。
  const outside = page.locator(".tree-note", { hasText: "ノートブックの外" });
  await expect(outside.locator(".tree-note-snippet")).toHaveText("持ち物の一覧");
  await expect(outside.locator(".tree-note-snippet mark")).toHaveText("持ち物");
  await outside.click();
  await expect(page.locator(".ProseMirror .search-match")).toHaveText("持ち物");
});

test("メモ全体の検索は、#タグ と notebook:名前 で絞り込める。本文の色付けは、絞り込みの書き方を除いた言葉にだけ付く", async ({ page }) => {
  await startLocalVault(page);
  await page.getByRole("button", { name: "ノートブックを追加" }).click();
  await page.getByPlaceholder("ノートブックの名前").fill("仕事");
  await page.getByPlaceholder("ノートブックの名前").press("Enter");
  await newNote(page, "家の予算", "予算の見直し #todo");
  await page.getByRole("button", { name: /^仕事/ }).click();
  await newNote(page, "会議の予算", "予算を決める #todo");
  await newNote(page, "会議の記録", "予算の話は来週");
  await page.locator(".nav", { hasText: "すべてのメモ" }).click();

  await page.keyboard.press("Control+Shift+f");
  await page.getByPlaceholder("メモを検索").fill("予算 #todo notebook:仕事");
  await expect(page.getByText("検索結果（1件）")).toBeVisible();
  await page.locator(".sidebar .tree-note", { hasText: "会議の予算" }).click();
  await expect(page.locator(".ProseMirror .search-match")).toHaveText(["予算"]);
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
  await selectSettingsPage(page, "ショートカット");
  await expect(page.getByRole("heading", { name: "キーボードショートカット" })).toBeVisible();
  await expect(page.locator(".shortcut-list").first()).toContainText("Ctrl + Alt + N");
  await expect(page.locator(".shortcut-list").last()).toContainText("Ctrl + Alt + Enter");

  // データの消去は、セキュリティのページにある。
  await selectSettingsPage(page, "セキュリティ");
  await page.getByRole("button", { name: "このデバイスのデータを消す" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Control+Alt+n");
  await expect(page.getByRole("tab")).toHaveCount(2);
});

test("設定でショートカットのキーを変えられる。使っているキーと編集のキーは断り、すべて既定に戻せる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "1 つ目", "");
  await page.keyboard.press("Control+,");
  await selectSettingsPage(page, "ショートカット");
  const keyButton = (name: string) => page.getByRole("button", { name: `「${name}」のキーを変える` });

  await keyButton("新しいメモ").click();
  await expect(keyButton("新しいメモ")).toHaveText("キーを押してください…");
  // 押したキーは、ほかのショートカット（Ctrl+K のコマンドパレット）に渡らず、使っているキーとして断る。
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("alert")).toHaveText("Ctrl + K は「コマンドパレット」で使っています。先にそちらのキーを変えてください。");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Control+b");
  await expect(page.getByRole("alert")).toContainText("Ctrl + B は、文字の編集やコピーなどに使われているので");
  await page.keyboard.press("Control+Alt+m");
  await expect(keyButton("新しいメモ")).toHaveText("Ctrl + Alt + M");
  await expect(page.getByRole("alert")).toHaveCount(0);

  // 本文の中のキーも変えられる（開いているメモにも、すぐ効く）。
  await keyButton("ブロックを複製").click();
  await page.keyboard.press("Control+Shift+y");
  await expect(keyButton("ブロックを複製")).toHaveText("Ctrl + Shift + Y");
  // 「置換」を Ctrl+R から外しても、Ctrl+R のブラウザの動き（読み込み直し）は止める。アプリより後に登録した受け手で確かめる。
  await keyButton("開いているメモの中を置換").click();
  await page.keyboard.press("Backspace");
  await expect(keyButton("開いているメモの中を置換")).toHaveText("キーなし");
  await page.evaluate(() => window.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key === "r") {
      (window as unknown as { ctrlRPrevented: boolean }).ctrlRPrevented = event.defaultPrevented;
    }
  }));
  await page.keyboard.press("Control+r");
  expect(await page.evaluate(() => (window as unknown as { ctrlRPrevented?: boolean }).ctrlRPrevented)).toBe(true);

  await page.getByRole("tab", { name: "1 つ目" }).click();
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("複製する段落");
  await page.keyboard.press("Control+d");
  await expect(page.locator(".ProseMirror p")).toHaveText(["複製する段落"]);
  await page.keyboard.press("Control+Shift+y");
  await expect(page.locator(".ProseMirror p")).toHaveText(["複製する段落", "複製する段落"]);
  await page.keyboard.press("Control+Alt+n");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.keyboard.press("Control+Alt+m");
  await expect(page.getByRole("tab")).toHaveCount(3);

  await page.getByRole("tab", { name: "設定" }).click();
  await page.getByRole("button", { name: "すべて既定に戻す" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "すべて既定に戻す" }).click();
  await expect(keyButton("新しいメモ")).toHaveText("Ctrl + Alt + N");
  await expect(keyButton("ブロックを複製")).toHaveText("Ctrl + D");
  await expect(keyButton("開いているメモの中を置換")).toHaveText("Ctrl + R");
});

test("メモの中の言葉を、1 つずつ、または全部まとめて置換できる。全部の置換は 1 回の取り消しで戻る", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "置換の試し", "りんご と みかん。りんご の木。りんご の実。");
  await page.keyboard.press("Control+f");
  await page.getByPlaceholder("このメモの中を検索").fill("りんご");
  await page.getByRole("button", { name: "置換の欄を出す" }).click();
  await page.getByPlaceholder("置換後の言葉").fill("もも");

  const body = page.locator(".ProseMirror");
  await page.getByRole("button", { name: "置換", exact: true }).click();
  await expect(body).toHaveText("もも と みかん。りんご の木。りんご の実。");
  await page.getByRole("button", { name: "すべて置換" }).click();
  await expect(body).toHaveText("もも と みかん。もも の木。もも の実。");

  await body.click();
  await page.keyboard.press("Control+z");
  await expect(body).toHaveText("もも と みかん。りんご の木。りんご の実。");
});

test("Ctrl+R で、置換の欄を開いた検索が出る。ブラウザの再読み込みはしない", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "置換の開き方", "りんご と みかん。");
  // ブラウザが再読み込みに使うキーなので、アプリがキーの既定の動きを止めたかを見る。
  await page.evaluate(() => window.addEventListener("keydown", (event) => {
    (window as unknown as { reloadKeyPrevented: boolean }).reloadKeyPrevented = event.defaultPrevented;
  }));
  await page.keyboard.press("Control+r");
  await expect(page.getByPlaceholder("置換後の言葉")).toBeVisible();
  await expect(page.getByPlaceholder("このメモの中を検索")).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { reloadKeyPrevented: boolean }).reloadKeyPrevented)).toBe(true);

  // 置換の欄は、左端のボタンで閉じて、また開ける。
  await page.getByRole("button", { name: "置換の欄を出す" }).click();
  await expect(page.getByPlaceholder("置換後の言葉")).toBeHidden();
});

test("大文字と小文字の区別と、単語単位をボタンで切り替えて探せる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "切り替えの試し", "Cat と cat と catalog");
  await page.keyboard.press("Control+f");
  await page.getByPlaceholder("このメモの中を検索").fill("cat");
  const count = page.locator(".find-bar").getByRole("status");
  await expect(count).toHaveText("1 / 3");
  await page.getByRole("button", { name: "大文字と小文字を区別する" }).click();
  await expect(count).toHaveText("1 / 2");
  await page.getByRole("button", { name: "単語単位で探す" }).click();
  await expect(count).toHaveText("1 / 1");
});

test("正規表現で探して、$1 を使って置換できる。読めない式は知らせる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "正規表現の試し", "締切は 2026-11-12、予備は 2026-12-01。");
  await page.keyboard.press("Control+r");
  await page.getByRole("button", { name: "正規表現で探す" }).click();
  const query = page.getByPlaceholder("このメモの中を検索");

  await query.fill("(\\d+)-(\\d+");
  await expect(page.locator(".find-bar").getByRole("status")).toHaveText("正規表現が正しくありません");
  await expect(query).toHaveAttribute("aria-invalid", "true");

  await query.fill("(\\d{4})-(\\d{2})-(\\d{2})");
  await expect(page.locator(".find-bar").getByRole("status")).toHaveText("1 / 2");
  await page.getByPlaceholder(/置換後の言葉/).fill("$2/$3（$1）");
  await page.getByRole("button", { name: "すべて置換" }).click();
  await expect(page.locator(".ProseMirror")).toHaveText("締切は 11/12（2026）、予備は 12/01（2026）。");
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

test("フォーカスモードでは左の列・タブ・ツールバーが隠れ、左上の戻るボタン・Esc・ショートカットで戻る", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "集中して書く", "本文");
  await page.getByRole("button", { name: "フォーカスモード", exact: true }).click();
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".tabs")).toBeHidden();
  await expect(page.locator(".editor-bar")).toBeHidden();
  await expect(page.locator(".ProseMirror")).toHaveText("本文");

  // 戻るボタンは、ズームの戻るボタンと同じ左上に置く。
  const exitButton = page.getByRole("button", { name: "フォーカスモードを終わる" });
  const exitBox = await exitButton.boundingBox();
  expect(exitBox!.x).toBeLessThan(40);
  expect(exitBox!.y).toBeLessThan(40);
  await exitButton.click();
  await expect(page.locator(".sidebar")).toBeVisible();

  await page.keyboard.press("Control+Alt+f");
  await expect(page.locator(".sidebar")).toBeHidden();
  // 「/」の候補を開いているときの Esc は、候補を閉じるだけで、フォーカスモードは終わらない。
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  await expect(page.getByRole("listbox", { name: "ブロックの種類" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "ブロックの種類" })).toBeHidden();
  await expect(page.locator(".sidebar")).toBeHidden();
  // 本文の中の Esc で、フォーカスモードを終わる。
  await page.keyboard.press("Escape");
  await expect(page.locator(".sidebar")).toBeVisible();
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

test("コマンドパレット（Ctrl+K）で、メモを題で探して開ける。「>」で始めると操作を探して実行できる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "会議の記録", "");
  await newNote(page, "買い物リスト", "");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "コマンドパレット" });
  await palette.getByRole("combobox").fill("会議");
  await expect(palette.getByRole("option")).toHaveText(["会議の記録", "「会議」という題で新しいメモを作る"]);
  await page.keyboard.press("Enter");
  await expect(palette).toHaveCount(0);
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("会議の記録");

  await page.keyboard.press("Control+k");
  await palette.getByRole("combobox").fill(">フォーカス");
  await expect(palette.getByRole("option")).toContainText(["フォーカスモード"]);
  await page.keyboard.press("Enter");
  await expect(page.locator(".sidebar")).toBeHidden();
});

test("コマンドパレットを開いた直後は、最近のメモの下に、よく使う操作をショートカットのキーと並べる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "会議の記録", "");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "コマンドパレット" });
  await expect(palette.locator(".menu-heading")).toHaveText(["メモ", "操作"]);
  await expect(palette.getByRole("option").locator(".nav-label")).toHaveText(["会議の記録", "新しいメモ", "設定を開く", "期限の一覧"]);
  await expect(palette.getByRole("option").locator("kbd")).toHaveText(["Ctrl + Alt + N", "Ctrl + ,", "Ctrl + Alt + E"]);
  // 最初に選ばれているのは、最近のメモ。下へ移って、操作を実行できる。
  await expect(palette.getByRole("option", { name: "会議の記録" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(palette).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("");
});

test("コマンドパレットを開いてすぐ打った文字は入力欄に入り、閉じると本文の続きに書ける", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "会議の記録", "本文");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "コマンドパレット" });
  await palette.waitFor();
  await page.keyboard.type("の");
  await expect(palette.getByRole("combobox")).toHaveValue("の");
  await page.keyboard.press("Escape");
  await page.keyboard.type("の続き");
  await expect(page.locator(".ProseMirror")).toHaveText("本文の続き");
});

test("コマンドパレットで ↓ を押し続けても、選んだ項目が一覧の見える範囲に残る。End と Home で端へ移る", async ({ page }) => {
  // 操作の一覧が、パレットの高さに収まらない窓の高さにする。
  await page.setViewportSize({ width: 1280, height: 420 });
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).waitFor();
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "コマンドパレット" });
  await palette.getByRole("combobox").fill(">");
  const list = palette.getByRole("listbox");
  const isSelectedOptionInView = () => list.evaluate((listElement) => {
    const listBox = listElement.getBoundingClientRect();
    const selectedBox = listElement.querySelector('[aria-selected="true"]')!.getBoundingClientRect();
    // 位置は小数になるので、1px までの差は見える範囲の中と数える。
    return selectedBox.top >= listBox.top - 1 && selectedBox.bottom <= listBox.bottom + 1;
  });
  const optionCount = await palette.getByRole("option").count();
  for (let pressed = 1; pressed < optionCount; pressed++) {
    await page.keyboard.press("ArrowDown");
    await expect.poll(isSelectedOptionInView, { message: `↓ を ${pressed} 回押したあと` }).toBe(true);
  }
  await expect(palette.getByRole("option").last()).toHaveAttribute("aria-selected", "true");

  // 言葉を消すと、Home と End は一覧の端へ移るのに使える。
  await palette.getByRole("combobox").fill("");
  await page.keyboard.press("End");
  await expect(palette.getByRole("option").last()).toHaveAttribute("aria-selected", "true");
  await expect.poll(isSelectedOptionInView).toBe(true);
  await page.keyboard.press("Home");
  await expect(palette.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => list.evaluate((listElement) => listElement.scrollTop)).toBe(0);
});

test("コマンドパレットの上端は、当たりの数が変わっても動かない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "買い物");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "コマンドパレット" });
  const topOf = async () => (await palette.boundingBox())!.y;
  const topWhenEmpty = await topOf();
  await palette.getByRole("combobox").fill(">");
  expect(await topOf()).toBe(topWhenEmpty);
  await palette.getByRole("combobox").fill("どこにも無い言葉 zzz");
  await expect(palette.getByRole("option")).toHaveCount(1);
  expect(await topOf()).toBe(topWhenEmpty);
});

test("コマンドパレットで打った言葉を題にして、新しいメモを作れる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "会議の記録", "");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "コマンドパレット" });
  await palette.getByRole("combobox").fill("来週の買い物");
  await palette.getByRole("option", { name: "「来週の買い物」という題で新しいメモを作る" }).click();
  await expect(page.getByRole("tab", { name: "来週の買い物" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("来週の買い物");
});

test("コマンドパレットは、メモの本文・ノートブック・設定の項目もまとめて探す。設定の項目を選ぶと、そのページのその項目へ移る", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "週の予定", "金曜に旅行の予約をする");
  const palette = page.getByRole("dialog", { name: "コマンドパレット" });

  await page.keyboard.press("Control+k");
  await palette.getByRole("combobox").fill("旅行");
  // 本文にだけ当たったメモは、本文の当たった所を添える。
  await expect(palette.getByRole("option", { name: /週の予定/ })).toContainText("旅行の予約");
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+k");
  await palette.getByRole("combobox").fill("文字の大きさ");
  const setting = palette.getByRole("option", { name: /本文の文字の大きさ/ });
  await expect(setting).toContainText("設定 › 一般");
  await setting.click();
  await expect(page.getByRole("navigation", { name: "設定のページ" }).getByRole("button", { name: "一般", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("本文の文字の大きさ")).toBeFocused();

  await page.keyboard.press("Control+k");
  await palette.getByRole("combobox").fill("暗号化キー");
  await palette.getByRole("option", { name: /暗号化キー/ }).first().click();
  await expect(page.getByRole("navigation", { name: "設定のページ" }).getByRole("button", { name: "同期", exact: true })).toHaveAttribute("aria-current", "page");
});

test("検索を名前を付けて保存でき、左の列から同じ検索を開ける。消したあとは「元に戻す」で戻せ、キーボードでも消すボタンに届く", async ({ page }) => {
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
  const toast = page.getByRole("status").filter({ hasText: "保存した検索「旅の準備」を削除しました" });
  await toast.getByRole("button", { name: "元に戻す" }).click();
  await savedSearch.click();
  await expect(page.getByPlaceholder("メモを検索")).toHaveValue("パスポート");

  // 行にフォーカスを置いて Tab を押すと、その行の消すボタンへ移る。
  await page.getByPlaceholder("メモを検索").fill("");
  await savedSearch.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "保存した検索「旅の準備」を消す" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(savedSearch).toHaveCount(0);
});

test("タブが多くても、開いたタブは見える所まで送られる", async ({ page }) => {
  await startLocalVault(page);
  for (let index = 1; index <= 9; index += 1) {
    await newNote(page, `とても長い題のメモ その ${index}`, "本文");
  }
  await page.locator(".tree-note", { hasText: "とても長い題のメモ その 1" }).first().click();
  await page.locator(".tree-note", { hasText: "とても長い題のメモ その 9" }).first().click();
  const strip = await page.getByRole("tablist").boundingBox();
  const active = await page.getByRole("tab", { selected: true }).boundingBox();
  expect(active!.x).toBeGreaterThanOrEqual(strip!.x - 1);
  expect(active!.x + active!.width).toBeLessThanOrEqual(strip!.x + strip!.width + 1);
});

test("左の列では、テンプレートとゴミ箱は、すべてのメモ・お気に入りと同じまとまりに並び、タグの見出しの下には並ばない", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "タグのあるメモ", "本文 #todo");
  // タグの見出しは、本文が保存されてタグが数えられてから出る。出るのを待ってから並びを読む。
  await expect(page.locator(".sidebar-scroll .section-title", { hasText: "タグ" })).toBeVisible();
  const order = await page.locator(".sidebar-scroll").evaluate((list) => [...list.querySelectorAll(".section-title, .nav-label")].map((element) => element.textContent?.trim() ?? ""));
  expect(order.indexOf("ゴミ箱")).toBeLessThan(order.findIndex((text) => text.startsWith("ノートブック")));
  expect(order.indexOf("ゴミ箱")).toBeLessThan(order.indexOf("タグ"));
});

test("検索で当たりが無いときは、検索の結果だと分かる文を出す", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "買い物", "牛乳");
  await page.keyboard.press("Control+Shift+f");
  await page.getByPlaceholder("メモを検索").fill("どこにも無い言葉");
  await expect(page.getByText("検索結果（0件）")).toBeVisible();
  await expect(page.locator(".sidebar")).toContainText("「どこにも無い言葉」に一致するメモはありません");
  await expect(page.locator(".sidebar").getByText("メモはありません", { exact: true })).toHaveCount(0);
});

test("タブを 1 つも開いていない本文の欄には、メモを作るボタンとキーの案内がある。空のゴミ箱を選ぶと、空だと伝える", async ({ page }) => {
  await startLocalVault(page);
  const emptyPane = page.locator(".main .empty-state");
  await expect(emptyPane).toContainText("Ctrl + Alt + N");
  await emptyPane.getByRole("button", { name: "メモを作成" }).click();
  await expect(page.getByRole("tab")).toHaveCount(1);
  await page.getByRole("tab").getByRole("button", { name: "タブを閉じる" }).click();
  await page.locator('.sidebar [data-view-key="trash"]').click();
  await expect(emptyPane).toHaveText("ゴミ箱は空です");
});

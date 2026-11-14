import { expect, type Locator, type Page, test } from "@playwright/test";
import { newTestRemoteConfig } from "../integration/testStorage";
import { createNoteOnDesktop, insertFromSlashMenu, openSettingsPage, openSyncedDevice, PASSPHRASE, PHONE_VIEWPORT, placeCursorAtBodyEnd, startLocalVault, syncNowOnDesktop } from "./devices";

const newNote = createNoteOnDesktop;

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
  await insertFromSlashMenu(laptop, "表", "表");
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

test("スマホの幅では、広い表と長いコードの行が画面をはみ出さない。表とコードは、それぞれの枠の中で横に送れる", async ({ browser }) => {
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
  // 長いコードの行は折り返さず、コードの枠の中で横に送る。
  await expect(page.locator(".ProseMirror pre")).toContainText("veryLongLine");
  expect(await page.locator(".ProseMirror pre").evaluate((code) => code.scrollWidth - code.clientWidth)).toBeGreaterThan(0);
});

test("コードのブロックは、言語を書かなくても色が付く", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "関数の例");
  await insertFromSlashMenu(page, "コード", "コード");
  await page.keyboard.type('function greet(name) { return "hello " + name; } // comment');
  await expect(page.locator(".ProseMirror pre .hljs-keyword").first()).toHaveText("function");
  await expect(page.locator(".ProseMirror pre .hljs-string").first()).toContainText("hello");
});

test("メモへのリンクは、リンク先の今のタイトルを出し、押すと開く。リンク先にはバックリンクが出る。消したリンク先は押せない", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "リンク先");
  await page.keyboard.type("こちらが本体");
  await newNote(page, "リンク元");
  await insertFromSlashMenu(page, "メモへのリンク", "メモへのリンク");
  const picker = page.getByRole("dialog", { name: "リンクするメモを選ぶ" });
  // 自分自身は選べない。
  await expect(picker.getByRole("button", { name: "リンク元" })).toHaveCount(0);
  await picker.getByRole("button", { name: "リンク先" }).click();
  const link = page.locator(".ProseMirror .note-link button");
  await expect(link).toHaveText("リンク先");

  await link.click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("リンク先");
  // リンク先のメモには、リンクしているメモ（バックリンク）が並び、押すと開く。
  const backlinks = page.getByRole("region", { name: "このメモへのリンク" });
  await expect(backlinks).toContainText("このメモへのリンク（1件）");
  await backlinks.getByRole("button", { name: "リンク元" }).click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("リンク元");
  await expect(page.getByRole("region", { name: "このメモへのリンク" })).toHaveCount(0);
  await page.getByRole("tab", { name: "リンク先" }).click();
  await page.getByPlaceholder("タイトル").fill("名前を変えた");
  await page.getByRole("tab", { name: "リンク元" }).click();
  await expect(link).toHaveText("名前を変えた");

  await page.getByRole("tab", { name: "名前を変えた" }).click();
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "ゴミ箱に移動" }).click();
  await page.getByRole("tab", { name: "リンク元" }).click();
  await expect(link).toHaveText("名前を変えた（ゴミ箱）");

  await link.click();
  await page.getByRole("button", { name: "完全に削除" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "完全に削除" }).click();
  await page.getByRole("tab", { name: "リンク元" }).click();
  await expect(link).toHaveText("削除されたメモ");
  await expect(link).toBeDisabled();
});

test("本文の配置は、メモの「…」でメモごとに選べ、既定は設定で選べる。複製したメモは配置を引き継ぐ", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "右に置くメモ");
  const documentColumn = page.locator(".document");
  await expect(documentColumn).toHaveClass(/align-center/);

  await page.locator(".editor-bar").getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("group", { name: "本文の配置" }).getByRole("button", { name: "右寄せ" }).click();
  await expect(documentColumn).toHaveClass(/align-right/);
  const columnBox = await documentColumn.boundingBox();
  const areaBox = await page.locator(".document-scroll").boundingBox();
  expect(Math.round(columnBox!.x + columnBox!.width)).toBe(Math.round(areaBox!.x + areaBox!.width));

  await page.locator(".editor-bar").getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "複製" }).click();
  await expect(page.getByRole("tab", { name: "「右に置くメモ」のコピー" })).toHaveAttribute("aria-selected", "true");
  await expect(documentColumn).toHaveClass(/align-right/);

  // 既定を左寄せにすると、配置を選んでいないメモは左寄せになり、選んだメモは変わらない。
  await newNote(page, "既定に従うメモ");
  await openSettingsPage(page, "一般");
  await page.getByLabel("本文の配置の既定").selectOption("left");
  await page.getByRole("tab", { name: "既定に従うメモ" }).click();
  await expect(documentColumn).toHaveClass(/align-left/);
  await page.getByRole("tab", { name: "右に置くメモ", exact: true }).click();
  await expect(documentColumn).toHaveClass(/align-right/);

  // 「既定」に戻すと、設定の既定に従う。
  await page.locator(".editor-bar").getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("group", { name: "本文の配置" }).getByRole("button", { name: "既定" }).click();
  await expect(documentColumn).toHaveClass(/align-left/);
});

test("タブを切り替えて戻ると、本文のスクロール位置とカーソルの位置が元に戻る", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "長いメモ");
  for (let line = 1; line <= 60; line += 1) {
    await page.keyboard.type(`${line} 行目`);
    await page.keyboard.press("Enter");
  }
  await page.locator(".ProseMirror p", { hasText: /^40 行目$/ }).click();
  await page.keyboard.press("End");
  const scroll = page.locator(".document-scroll");
  await scroll.evaluate((element) => { element.scrollTop = 600; });
  await newNote(page, "別のメモ");

  await page.getByRole("tab", { name: "長いメモ" }).click();
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(550);
  await page.keyboard.type("（ここ）");
  await expect(page.locator(".ProseMirror p", { hasText: "（ここ）" })).toHaveText("40 行目（ここ）");
});

test("メモへのリンクにポインターを乗せると、リンク先の題と本文の頭が出て、離すと消える", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "旅行の持ち物");
  await page.keyboard.type("パスポートと充電器を入れる");
  await newNote(page, "週の予定");
  await page.keyboard.type("/めも");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "リンクするメモを選ぶ" }).getByRole("button", { name: "旅行の持ち物" }).click();

  const link = page.locator(".ProseMirror .note-link button");
  await link.hover();
  const preview = page.getByRole("tooltip");
  await expect(preview).toContainText("旅行の持ち物");
  await expect(preview).toContainText("パスポートと充電器を入れる");
  await page.mouse.move(5, 400);
  await expect(preview).toHaveCount(0);
});

test("メニューから開いたダイアログも、Escape で閉じられる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "履歴を見るメモ");
  await page.locator(".editor-bar").getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "履歴" }).click();
  await expect(page.getByRole("dialog", { name: "履歴" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "履歴" })).toBeHidden();
});

test("履歴から、書き直す前の状態にそのメモを戻せる。戻す前の状態は「復元の前」として履歴に残る", async ({ page }) => {
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
  await history.getByRole("button", { name: "このバージョンに戻す" }).click();

  // 別のメモは作らず、開いているメモがそのまま戻る。
  await expect(history).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "このバージョンを復元しました" })).toHaveText("このバージョンを復元しました。復元前の状態は履歴に残っています。");
  await expect(page.locator(".ProseMirror")).toHaveText("書き直す前の文");
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("議事録");
  await expect(page.getByRole("tab", { name: /議事録/ })).toHaveCount(1);
  await expect(page.locator(".tree-note", { hasText: "議事録" })).toHaveCount(1);

  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "履歴" }).click();
  await expect(history.getByRole("option")).toHaveCount(2);
  await expect(history.getByRole("option").first()).toContainText("復元の前");
  await history.getByRole("option").first().click();
  await expect(history.locator(".note-history-preview")).toContainText("書き直した文");
});

test("スマホで、リンクから別のメモを開いたあとも、端末の「戻る」1 回で一覧に戻り、アプリの外へ出ない", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(page);
  const createNote = async (title: string) => {
    await page.locator(".fab").click();
    await page.getByPlaceholder("タイトル").fill(title);
    await page.getByPlaceholder("タイトル").press("Enter");
  };
  await createNote("リンク先");
  await page.getByRole("button", { name: "戻る" }).click();
  await createNote("リンク元");
  await insertFromSlashMenu(page, "メモへのリンク", "メモへのリンク");
  await page.getByRole("dialog", { name: "リンクするメモを選ぶ" }).getByRole("button", { name: "リンク先" }).click();
  await page.locator(".ProseMirror .note-link button").click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("リンク先");

  await page.goBack();
  await expect(page.getByRole("heading", { name: "すべてのメモ" })).toBeVisible();
  // もう 1 回戻っても、積んだ履歴が残っていてメモが開き直る、ということがない。
  await page.getByRole("button", { name: /リンク元/ }).click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("リンク元");
  await page.getByRole("button", { name: "戻る" }).click();
  await expect(page.getByRole("heading", { name: "すべてのメモ" })).toBeVisible();
});

test("目次に見出しが並び、押すとその見出しへ移る。出したままにする設定は開き直しても保たれる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "長いメモ");
  await page.keyboard.type("# 第 1 章");
  await page.keyboard.press("Enter");
  for (let line = 0; line < 40; line += 1) {
    await page.keyboard.type(`本文 ${line}`);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.type("## 第 2 節");
  await page.getByRole("button", { name: "目次" }).click();
  const outline = page.getByRole("navigation", { name: "目次" });
  await expect(outline.getByRole("button")).toHaveText(["第 1 章", "第 2 節"]);

  await outline.getByRole("button", { name: "第 1 章" }).click();
  await expect(page.locator(".ProseMirror h1")).toBeInViewport();
  await outline.getByRole("button", { name: "第 2 節" }).click();
  await expect(page.locator(".ProseMirror h2")).toBeInViewport();
  await expect(page.locator(".ProseMirror h1")).not.toBeInViewport();

  await page.waitForTimeout(500);
  await page.reload();
  await page.getByLabel("パスフレーズ").fill("correct horse battery");
  await page.getByRole("button", { name: "解除" }).click();
  await page.getByRole("button", { name: "長いメモ" }).click();
  await expect(page.getByRole("navigation", { name: "目次" })).toBeVisible();
});

test("メモをテンプレートにすると「テンプレート」に並び、型から新しいメモを作れる。「/」からは本文に入れられる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "議事録の型");
  await page.keyboard.type("## 決まったこと");
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "テンプレートにする" }).click();
  // ふつうの一覧からは外れ、「テンプレート」に並ぶ。
  await expect(page.locator(".nav-row", { hasText: "すべてのメモ" }).locator(".count")).toHaveCount(0);
  await expect(page.locator(".nav-row", { hasText: "テンプレート" }).locator(".count")).toHaveText("1");

  await page.getByRole("button", { name: "このテンプレートから新しいメモを作る" }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.locator(".ProseMirror h2")).toHaveText("決まったこと");
  await expect(page.getByText("このメモはテンプレートです")).toHaveCount(0);
  await expect(page.locator(".nav-row", { hasText: "すべてのメモ" }).locator(".count")).toHaveText("1");

  await newNote(page, "別のメモ");
  await page.keyboard.type("/議事録");
  await expect(page.getByRole("listbox", { name: "ブロックの種類" }).getByRole("option")).toHaveText(["テンプレート: 議事録の型"]);
  await page.keyboard.press("Enter");
  await expect(page.locator(".ProseMirror h2")).toHaveText("決まったこと");
});

test("テンプレートの @date・@time・@title は、新しいメモを作るときと「/」で入れるときに、その時の値に置き換わる。テンプレートは変わらない", async ({ page }) => {
  // テンプレートの日付と時刻の形式（既定は 2026-11-13 の形）で入る。
  await page.clock.install({ time: new Date(2026, 10, 13, 9, 5) });
  await startLocalVault(page);
  await newNote(page, "@date の日報");
  await page.keyboard.type("## @title");
  await page.keyboard.press("Enter");
  await page.keyboard.type("作成 @time、連絡先 foo@date.example");
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "テンプレートにする" }).click();
  await expect(page.getByText("@date（日付）・@time（時刻）")).toBeVisible();

  await page.getByRole("button", { name: "このテンプレートから新しいメモを作る" }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("2026-11-13 の日報");
  await expect(page.locator(".ProseMirror h2")).toHaveText("2026-11-13 の日報");
  await expect(page.locator(".ProseMirror p", { hasText: "作成" })).toHaveText("作成 09:05、連絡先 foo@date.example");

  // 「/」で入れるときは、@title は入れる先のメモの題になる。
  await newNote(page, "週次の振り返り");
  // CI でときどき、続けて打った「/日報」で候補が 1 つも出ずに落ちる（手元では再現しない。原因は確かめられていない）。
  // 「/」でメニューが開いたのを確かめてから絞り込む。次に落ちたとき、メニューが開かなかったのか、当たりが無かったのかを分ける。
  await placeCursorAtBodyEnd(page);
  await expect(page.locator(".ProseMirror")).toBeFocused();
  await page.keyboard.type("/");
  const slashMenu = page.getByRole("listbox", { name: "ブロックの種類" });
  await expect(slashMenu.getByRole("option", { name: "テンプレート: @date の日報" })).toBeAttached();
  await page.keyboard.type("日報");
  await expect(slashMenu.getByRole("option")).toHaveText(["テンプレート: @date の日報"]);
  await page.keyboard.press("Enter");
  await expect(page.locator(".ProseMirror h2")).toHaveText("週次の振り返り");
  await expect(page.locator(".ProseMirror p", { hasText: "作成" })).toHaveText("作成 09:05、連絡先 foo@date.example");

  await page.getByRole("tab", { name: "@date の日報" }).click();
  await expect(page.locator(".ProseMirror h2")).toHaveText("@title");
  await expect(page.locator(".ProseMirror p", { hasText: "作成" })).toHaveText("作成 @time、連絡先 foo@date.example");
});

test("テンプレートの日付と時刻の形式を言語の書き方にすると、@date・@datetime もその書き方になる", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 13, 9, 5) });
  await startLocalVault(page);
  await openSettingsPage(page, "一般");
  await page.getByLabel("日付と時刻の形式").selectOption("long");
  await expect(page.getByText("テンプレートの @date・@time・@datetime を、この形式で入れます。")).toBeVisible();

  await newNote(page, "@date の日報");
  await page.keyboard.type("作成 @datetime");
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "テンプレートにする" }).click();
  await page.getByRole("button", { name: "このテンプレートから新しいメモを作る" }).click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("2026年11月13日 の日報");
  await expect(page.locator(".ProseMirror p", { hasText: "作成" })).toHaveText("作成 2026年11月13日 9:05");
});

async function pasteText(page: Page, contents: Record<string, string>): Promise<void> {
  await page.locator(".ProseMirror").evaluate((editor, clipboardContents) => {
    const transfer = new DataTransfer();
    for (const [type, value] of Object.entries(clipboardContents)) {
      transfer.setData(type, value);
    }
    editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, contents);
}

test("Markdown の文字を貼り付けると、見出し・リスト・表・コードになる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "貼り付けのメモ");
  await page.locator(".ProseMirror").click();
  await pasteText(page, { "text/plain": "# 題名\n\n- 牛乳\n- [x] 卵\n\n| 品目 | 数 |\n|---|---|\n| 紙 | 2 |\n\n```js\nconst x = 1;\n```\n\n#### 小さい見出し\n" });

  const body = page.locator(".ProseMirror");
  await expect(body.locator("h1")).toHaveText("題名");
  await expect(body.locator("li").first()).toHaveText("牛乳");
  await expect(body.locator('li[data-checked="true"] p')).toHaveText("卵");
  expect(await tableShape(page)).toEqual([["品目", "数"], ["紙", "2"]]);
  await expect(body.locator("pre code")).toHaveText("const x = 1;");
  await expect(body.locator("h4")).toHaveText("小さい見出し");
  await expect(body).not.toContainText("# 題名");
});

test("行の途中に太字の Markdown を貼り付けても、行が分かれない", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "行の途中のメモ");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("前の文字 ");
  await pasteText(page, { "text/plain": "ここが **大事** です" });

  const paragraphs = page.locator(".ProseMirror p");
  await expect(paragraphs).toHaveCount(1);
  await expect(paragraphs.first()).toHaveText("前の文字 ここが 大事 です");
  await expect(paragraphs.first().locator("strong")).toHaveText("大事");
});

test("コードの中と、Markdown の書き方が無い文字は、そのままの文字で貼り付く", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "そのまま貼るメモ");
  await page.locator(".ProseMirror").click();
  await pasteText(page, { "text/plain": "#買い物 のメモ" });
  await expect(page.locator(".ProseMirror p").first()).toHaveText("#買い物 のメモ");

  await page.keyboard.press("Enter");
  await page.keyboard.type("```");
  await page.keyboard.press("Enter");
  await pasteText(page, { "text/plain": "# これは見出しにしない" });
  await expect(page.locator(".ProseMirror pre code")).toHaveText("# これは見出しにしない");
  await expect(page.locator(".ProseMirror h1")).toHaveCount(0);
});

const firstBodyCell = (page: Page) => page.locator(".ProseMirror td").first();

test("表の行と列を、上と左にも足せる。表の中のショートカットでも足せる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "行と列を足すメモ");
  await page.locator(".ProseMirror").click();
  await insertFromSlashMenu(page, "表", "表");
  await firstBodyCell(page).click();
  await page.keyboard.type("もと");

  await chooseTableAction(page, "上に行を追加");
  await chooseTableAction(page, "左に列を追加");
  expect(await tableShape(page)).toEqual([["", "", "", ""], ["", "", "", ""], ["", "もと", "", ""], ["", "", "", ""]]);

  // ショートカットで足しても、カーソルは元のセルに残る。セルの真ん中を押すと、文字の大きさによっては文字の途中に
  // カーソルが入るので、押したあとにセルの文字の末尾へ移す。
  await page.locator(".ProseMirror td", { hasText: "もと" }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await page.keyboard.press("ControlOrMeta+Alt+Enter");
  await page.keyboard.press("ControlOrMeta+Alt+Shift+Enter");
  await page.keyboard.type("のセル");
  const empty = ["", "", "", "", "", ""];
  expect(await tableShape(page)).toEqual([empty, empty, empty, ["", "", "もとのセル", "", "", ""], empty, empty]);
});

test("表のヘッダー行とヘッダー列を切り替えられる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "ヘッダーのメモ");
  await page.locator(".ProseMirror").click();
  await insertFromSlashMenu(page, "表", "表");
  const headerCells = page.locator(".ProseMirror th");
  await expect(headerCells).toHaveCount(3);

  await firstBodyCell(page).click();
  await page.getByRole("button", { name: "表", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "ヘッダー行" })).toBeChecked();
  await expect(page.getByRole("menuitemcheckbox", { name: "ヘッダー列" })).not.toBeChecked();
  await page.getByRole("menuitemcheckbox", { name: "ヘッダー行" }).click();
  await expect(headerCells).toHaveCount(0);

  await page.locator(".ProseMirror td").first().click();
  await page.getByRole("button", { name: "表", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "ヘッダー列" }).click();
  await expect(headerCells).toHaveCount(3);
  await expect(page.locator(".ProseMirror tr").first().locator("th")).toHaveCount(1);
});

test("表のセルを結合し、分割で元に戻せる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "結合のメモ");
  await page.locator(".ProseMirror").click();
  await insertFromSlashMenu(page, "表", "表");
  const cells = page.locator(".ProseMirror td");
  await cells.nth(0).click();
  await page.keyboard.type("左");
  // セルの外まで選択を広げると、セルを選んだ状態になる。
  await cells.nth(0).hover();
  await page.mouse.down();
  await cells.nth(1).hover();
  await page.mouse.up();
  // 選んだセルに重ねる色は、中の文字が読めるよう透けている。
  await expect(page.locator(".ProseMirror .selectedCell")).toHaveCount(2);
  const selectionColor = await page.locator(".ProseMirror .selectedCell").first().evaluate((cell) => getComputedStyle(cell, "::after").backgroundColor);
  // 透けている色は、color(srgb … / 0.18) か rgba(…, 0.18) の形になる。
  expect(selectionColor).toMatch(/\/ 0?\.\d+\)$|^rgba\(.*, 0?\.\d+\)$/);

  await page.getByRole("button", { name: "表", exact: true }).click();
  await page.getByRole("menuitem", { name: "セルを結合" }).click();
  await expect(page.locator('.ProseMirror td[colspan="2"]')).toHaveText("左");
  await expect(cells).toHaveCount(5);

  await page.locator('.ProseMirror td[colspan="2"]').click();
  await page.getByRole("button", { name: "表", exact: true }).click();
  await page.getByRole("menuitem", { name: "セルを分割" }).click();
  await expect(cells).toHaveCount(6);
});

test("表の列の揃え方を選ぶと、その列の全部のセルが揃う", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "揃えのメモ");
  await page.locator(".ProseMirror").click();
  await insertFromSlashMenu(page, "表", "表");
  await page.locator(".ProseMirror td").nth(1).click();
  await page.getByRole("button", { name: "表", exact: true }).click();
  await page.getByRole("button", { name: "列を右揃え" }).click();

  const alignments = await page.evaluate(() =>
    [...document.querySelectorAll(".ProseMirror table tr")].map((row) => [...row.children].map((cell) => (cell as HTMLElement).style.textAlign)));
  expect(alignments).toEqual([["", "right", ""], ["", "right", ""], ["", "right", ""]]);
});

test("表の列の境目をドラッグすると、列の幅が変わる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "列幅のメモ");
  await page.locator(".ProseMirror").click();
  await insertFromSlashMenu(page, "表", "表");
  const firstHeader = page.locator(".ProseMirror th").first();
  const widthBefore = (await firstHeader.boundingBox())!.width;
  const box = (await firstHeader.boundingBox())!;
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 119, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await firstHeader.boundingBox())!.width).toBeGreaterThan(widthBefore + 80);
  await expect(firstHeader).toHaveAttribute("colwidth", /\d+/);
});

test("文字の入った表でも、セルの中から列の境目へマウスを寄せてドラッグすると、いちばん右の列も含めて幅が変わる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "文字の入った表");
  await page.locator(".ProseMirror").click();
  await insertFromSlashMenu(page, "表", "表");
  for (const text of ["品目", "数量", "メモ", "ノートパソコン", "2", "会議室で使う。来週の月曜日までに用意して、総務に連絡する"]) {
    await page.keyboard.type(text);
    await page.keyboard.press("Tab");
  }
  const headers = page.locator(".ProseMirror th");
  const widthOf = async (index: number) => (await headers.nth(index).boundingBox())!.width;
  // セルの中から境目の手前（境目から 3px 内側）まで寄せてから押す。境目の上ではマウスの形が変わる。
  const dragRightBorder = async (index: number, distance: number) => {
    const box = (await headers.nth(index).boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.move(box.x + box.width - 3, y, { steps: 4 });
    await expect(page.locator(".ProseMirror")).toHaveClass(/resize-cursor/);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 3 + distance, y, { steps: 6 });
    await page.mouse.up();
  };

  const firstBefore = await widthOf(0);
  await dragRightBorder(0, 80);
  await expect.poll(() => widthOf(0)).toBeGreaterThan(firstBefore + 60);
  const lastBefore = await widthOf(2);
  await dragRightBorder(2, -120);
  await expect.poll(() => widthOf(2)).toBeLessThan(lastBefore - 100);
});

test("選んだ文字にハイライトと文字色を付け、色なしで外せる。表のセルには背景色を付けられる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "色のメモ");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("大事な文字");
  await page.keyboard.press("ControlOrMeta+a");

  await page.getByRole("button", { name: "ハイライト" }).click();
  await page.getByRole("button", { name: "緑" }).click();
  await expect(page.locator('.ProseMirror mark[data-color="green"]')).toHaveText("大事な文字");
  await page.getByRole("button", { name: "文字色" }).click();
  await page.getByRole("button", { name: "赤" }).click();
  await expect(page.locator('.ProseMirror [data-text-color="red"]')).toHaveText("大事な文字");

  await page.getByRole("button", { name: "ハイライト" }).click();
  await page.getByRole("button", { name: "色なし" }).click();
  await expect(page.locator(".ProseMirror mark")).toHaveCount(0);
  await expect(page.locator('.ProseMirror [data-text-color="red"]')).toHaveText("大事な文字");

  // 全体を選んだまま End を押すと、エディタがカーソルの移動を読み取る前に次のキーが届くことがあるので、エディタの操作で末尾へ移す。
  await placeCursorAtBodyEnd(page);
  await page.keyboard.press("Enter");
  await insertFromSlashMenu(page, "表", "表");
  await firstBodyCell(page).click();
  await page.getByRole("button", { name: "表", exact: true }).click();
  await page.getByRole("button", { name: "青" }).click();
  await expect(page.locator('.ProseMirror td[data-background-color="blue"]')).toHaveCount(1);
});

async function pasteTable(page: Page, markdown: string): Promise<void> {
  await page.locator(".ProseMirror").click();
  await pasteText(page, { "text/plain": markdown });
  await expect(page.locator(".ProseMirror table")).toHaveCount(1);
}

const PRICE_TABLE = "| 品目 | 金額 |\n|---|---|\n| ペン | 800 |\n| 紙 | 50 |\n| ノート | 1200 |\n";

test("表の行と列を隣と入れ替えられる。列の値で行をソートでき、ヘッダーの行は動かない", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "並べ替えのメモ");
  await pasteTable(page, PRICE_TABLE);

  await page.locator(".ProseMirror td", { hasText: "紙" }).click();
  await chooseTableAction(page, "行を上へ移動");
  expect(await tableShape(page)).toEqual([["品目", "金額"], ["紙", "50"], ["ペン", "800"], ["ノート", "1200"]]);
  await page.locator(".ProseMirror td", { hasText: "紙" }).click();
  await chooseTableAction(page, "列を右へ移動");
  expect(await tableShape(page)).toEqual([["金額", "品目"], ["50", "紙"], ["800", "ペン"], ["1200", "ノート"]]);

  await page.locator(".ProseMirror td", { hasText: "800" }).click();
  await chooseTableAction(page, "この列で降順にソート");
  expect(await tableShape(page)).toEqual([["金額", "品目"], ["1200", "ノート"], ["800", "ペン"], ["50", "紙"]]);
});

test("表の行を、列に含まれる言葉でフィルターできる。隠れた行は消えず、解除すると戻る", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "フィルターのメモ");
  await pasteTable(page, PRICE_TABLE);

  await page.locator(".ProseMirror td", { hasText: "ペン" }).click();
  await chooseTableAction(page, "この列で行をフィルター");
  await page.getByRole("dialog").getByRole("textbox").fill("ノ");
  await page.keyboard.press("Enter");
  await expect(page.locator(".ProseMirror tr:visible")).toHaveCount(2);
  await expect(page.locator(".ProseMirror tr")).toHaveCount(4);
  await expect(page.locator(".ProseMirror table.rows-filtered, .ProseMirror .rows-filtered")).toHaveCount(1);

  await page.locator(".ProseMirror td", { hasText: "ノート" }).click();
  await chooseTableAction(page, "フィルターを解除");
  await expect(page.locator(".ProseMirror tr:visible")).toHaveCount(4);
});

test("子の項目を持つ箇条書きと、見出しを折りたためる。折りたたんでも中身は消えず、開くと戻る", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "折りたたみのメモ");
  await page.locator(".ProseMirror").click();
  await pasteText(page, { "text/plain": "## 買い物\n\n- 野菜\n  - にんじん\n  - 玉ねぎ\n- 果物\n\n段落\n\n## 次の見出し\n\n残る段落\n" });
  const body = page.locator(".ProseMirror");
  await expect(body.getByText("にんじん")).toBeVisible();

  // 子の項目を持つ項目にだけ、開け閉めの印が出る。
  const vegetables = body.locator("li", { hasText: "野菜" }).first();
  await expect(body.locator("li .fold-toggle")).toHaveCount(1);
  await vegetables.hover();
  await vegetables.locator(".fold-toggle").first().click();
  await expect(body.getByText("にんじん")).toBeHidden();
  await expect(body.getByText("果物")).toBeVisible();
  await vegetables.locator(".fold-toggle").first().click();
  await expect(body.getByText("にんじん")).toBeVisible();

  // 見出しを折りたたむと、次の同じ段の見出しまでが隠れる。
  const shopping = body.locator("h2", { hasText: "買い物" });
  await shopping.hover();
  await shopping.locator(".fold-toggle").click();
  await expect(body.getByText("野菜")).toBeHidden();
  await expect(body.getByText("段落", { exact: true })).toBeHidden();
  await expect(body.getByText("次の見出し")).toBeVisible();
  await expect(body.getByText("残る段落")).toBeVisible();
  await expect(shopping.locator(".fold-toggle")).toHaveAttribute("aria-expanded", "false");
});

test("見出しを折りたたんでも、メモを編集したことにはならず、「更新した順」の並びは変わらない", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "折りたたむメモ");
  await page.locator(".ProseMirror").click();
  await pasteText(page, { "text/plain": "## 決まったこと\n\n見積もりを出す\n" });
  await newNote(page, "あとで作ったメモ");
  const titles = page.locator(".tree-note");
  await expect(titles).toHaveText(["あとで作ったメモ", "折りたたむメモ"]);

  await page.getByRole("tab", { name: /折りたたむメモ/ }).click();
  const heading = page.locator(".ProseMirror h2", { hasText: "決まったこと" });
  await heading.hover();
  await heading.locator(".fold-toggle").click();
  await expect(page.locator(".ProseMirror").getByText("見積もりを出す")).toBeHidden();

  await expect(titles).toHaveText(["あとで作ったメモ", "折りたたむメモ"]);

  // 開け閉めは保存される。開き直しても折りたたんだままで、並びも変わらない（保存のあとの並びを見る）。
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByLabel("パスフレーズ").fill(PASSPHRASE);
  await page.getByRole("button", { name: "解除" }).click();
  await expect(titles).toHaveText(["あとで作ったメモ", "折りたたむメモ"]);
  await titles.filter({ hasText: "折りたたむメモ" }).click();
  await expect(page.locator(".ProseMirror h2", { hasText: "決まったこと" }).locator(".fold-toggle")).toHaveAttribute("aria-expanded", "false");
});

test("ブロックにマウスを乗せると出る持ち手をドラッグすると、そのブロックを別の位置へ動かせる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "ドラッグのメモ");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("1 つ目");
  await page.keyboard.press("Enter");
  await page.keyboard.type("2 つ目");
  await page.keyboard.press("Enter");
  await page.keyboard.type("3 つ目");
  const paragraphs = page.locator(".ProseMirror > p");
  await expect(paragraphs).toHaveText(["1 つ目", "2 つ目", "3 つ目"]);

  await paragraphs.nth(2).hover();
  const handle = page.getByRole("button", { name: "ドラッグしてブロックを動かす" });
  await expect(handle).toBeVisible();
  // 3 つ目の段落を、1 つ目の段落の上へ落とす。
  const handleBox = (await handle.boundingBox())!;
  const firstParagraphBox = (await paragraphs.nth(0).boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(firstParagraphBox.x + 10, firstParagraphBox.y + 2, { steps: 8 });
  await page.mouse.up();
  await expect(paragraphs).toHaveText(["3 つ目", "1 つ目", "2 つ目"]);
});

test("持ち手をつかんだまま、持ち手の左右の位置を変えずに縦に動かしても、ブロックを動かせる", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "縦だけのドラッグ");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("1 つ目");
  await page.keyboard.press("Enter");
  await page.keyboard.type("2 つ目");
  await page.keyboard.press("Enter");
  await page.keyboard.type("3 つ目");
  const paragraphs = page.locator(".ProseMirror > p");
  await expect(paragraphs).toHaveText(["1 つ目", "2 つ目", "3 つ目"]);

  await paragraphs.nth(2).hover();
  const handle = page.getByRole("button", { name: "ドラッグしてブロックを動かす" });
  await expect(handle).toBeVisible();
  // マウスは本文の左の余白（持ち手の x）のまま、1 つ目の段落の高さまで上げて落とす。
  const handleBox = (await handle.boundingBox())!;
  const firstParagraphBox = (await paragraphs.nth(0).boundingBox())!;
  const handleX = handleBox.x + handleBox.width / 2;
  await page.mouse.move(handleX, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleX, firstParagraphBox.y + 2, { steps: 8 });
  await expect(page.locator(".ProseMirror-dropcursor, .prosemirror-dropcursor-block")).toBeVisible();
  await page.mouse.up();
  await expect(paragraphs).toHaveText(["3 つ目", "1 つ目", "2 つ目"]);
});

test("箇条書きの項目を持ち手でドラッグすると、子の項目ごと動く", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "項目のドラッグ");
  await page.keyboard.type("- A");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("A1");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("B");
  await page.keyboard.press("Enter");
  await page.keyboard.type("C");
  const items = page.locator(".ProseMirror li > p");
  await expect(items).toHaveText(["A", "A1", "B", "C"]);

  const itemA = page.locator(".ProseMirror li", { has: page.locator("> p", { hasText: /^A$/ }) });
  await itemA.locator("> p").hover();
  const handle = page.getByRole("button", { name: "ドラッグしてブロックを動かす" });
  const handleBox = (await handle.boundingBox())!;
  const itemC = (await page.locator(".ProseMirror li > p", { hasText: /^C$/ }).boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  // 「C」の項目の上へ落とす。項目の中に項目は入らないので、エディタは C の項目のすぐ後ろに入れる（落とす先の線もそこに出る）。
  await page.mouse.move(itemC.x + 10, itemC.y + 3, { steps: 8 });
  await page.mouse.up();
  await expect(items).toHaveText(["B", "C", "A", "A1"]);
  await expect(page.locator(".ProseMirror li", { has: page.locator("> p", { hasText: /^A$/ }) }).locator("li > p")).toHaveText(["A1"]);
});

test("Tab で箇条書きの項目が深くなり、番号は 1. → a. → i.、点は ● → ○ → ■ と変わる。深くできない所の Tab は、本文の外へ出ない", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "字下げのメモ");
  const body = page.locator(".ProseMirror");
  const isBodyFocused = () => page.evaluate(() => document.activeElement?.classList.contains("ProseMirror") ?? false);

  // ふつうの段落の Tab は、何もせず、続けて打った文字が本文に入る。
  await page.keyboard.type("段落");
  await page.keyboard.press("Tab");
  expect(await isBodyFocused()).toBe(true);
  await page.keyboard.type("の続き");
  await expect(body.locator("p").first()).toHaveText("段落の続き");

  // 最初の項目は深くできないので、何もしない。
  await page.keyboard.press("Enter");
  await page.keyboard.type("1. 一");
  await page.keyboard.press("Tab");
  expect(await isBodyFocused()).toBe(true);
  for (const text of ["二", "三", "四"]) {
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.type(text);
  }
  const listStyles = () => page.evaluate(() => [...document.querySelectorAll(".ProseMirror ol")].map((list) => getComputedStyle(list).listStyleType));
  expect(await listStyles()).toEqual(["decimal", "lower-alpha", "lower-roman", "decimal"]);
  await page.keyboard.press("Shift+Tab");
  await expect(body.locator("ol ol ol > li > p")).toHaveText(["三", "四"]);

  await placeCursorAtBodyEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- 点");
  for (const text of ["点の子", "点の孫"]) {
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.type(text);
  }
  const bulletStyles = await page.evaluate(() => [...document.querySelectorAll(".ProseMirror ul")].map((list) => getComputedStyle(list).listStyleType));
  expect(bulletStyles).toEqual(["disc", "circle", "square"]);
});

test("コードのブロックでは、Tab で行を字下げし、Shift+Tab で戻す", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "コードの字下げ");
  await insertFromSlashMenu(page, "コード", "コード");
  await page.keyboard.type("if (a) {");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("b();");
  await expect(page.locator(".ProseMirror pre")).toHaveText("if (a) {\n    b();");
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(".ProseMirror pre")).toHaveText("if (a) {\nb();");
});

test("日本語入力をオンのまま打つ「・ 」「ー 」「１． 」でも箇条書きになり、直後の Backspace で打った文字に戻る", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "日本語の箇条書き");
  const body = page.locator(".ProseMirror");
  for (const [typed, selector] of [["・\u3000", "ul > li"], ["ー\u3000", "ul > li"], ["１．\u3000", "ol > li"], ["２. ", "ol > li"]] as const) {
    await page.keyboard.insertText(typed.slice(0, -1));
    await page.keyboard.insertText(typed.slice(-1));
    await expect(body.locator(selector)).toHaveCount(1);
    await page.keyboard.press("Backspace");
    await expect(body.locator(selector)).toHaveCount(0);
    await expect(body.locator("p").first()).toHaveText(typed);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
  }
  await page.keyboard.insertText("３．");
  await page.keyboard.insertText("\u3000");
  await page.keyboard.type("三つ目");
  await expect(body.locator("ol")).toHaveAttribute("start", "3");
  await expect(body.locator("ol > li")).toHaveText(["三つ目"]);
});

test("すべて折りたたむ・すべて開くで、子のある項目と見出しを一度に開け閉めでき、隠れた所にあったカーソルは見える所へ移る", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "折りたたみ");
  await page.keyboard.type("## 章");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- 親");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("子");
  const body = page.locator(".ProseMirror");
  await page.keyboard.press("ControlOrMeta+Alt+[");
  await expect(body.locator("h2")).toHaveAttribute("data-collapsed", "true");
  await expect(body.getByText("親")).toBeHidden();
  // カーソルは隠れた「子」から、見えている見出しの末尾へ移る。続けて打った文字は見出しに入る。
  await page.keyboard.type("1");
  await expect(body.locator("h2")).toHaveText("章1");

  await page.keyboard.press("ControlOrMeta+Alt+]");
  await expect(body.getByText("子")).toBeVisible();
  await expect(body.locator("[data-collapsed]")).toHaveCount(0);

  // メモの「…」からもできる。
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "すべて折りたたむ" }).click();
  await expect(body.locator("[data-collapsed=true]")).toHaveCount(2);
  await page.getByRole("button", { name: "その他の操作" }).last().click();
  await page.getByRole("menuitem", { name: "すべて開く" }).click();
  await expect(body.locator("[data-collapsed]")).toHaveCount(0);
});

test("Ctrl+Shift+↑↓ でブロックを上下に動かし（箇条書きの項目は子ごと）、Ctrl+D ですぐ下に複製する", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "ブロックのキー");
  const body = page.locator(".ProseMirror");
  await page.keyboard.type("一");
  await page.keyboard.press("Enter");
  await page.keyboard.type("二");
  await page.keyboard.press("Enter");
  await page.keyboard.type("三");
  await expect(body.locator("> p")).toHaveText(["一", "二", "三"]);
  await page.keyboard.press("ControlOrMeta+Shift+ArrowUp");
  await expect(body.locator("> p")).toHaveText(["一", "三", "二"]);
  await page.keyboard.press("ControlOrMeta+Shift+ArrowUp");
  await page.keyboard.press("ControlOrMeta+Shift+ArrowUp");
  await expect(body.locator("> p")).toHaveText(["三", "一", "二"]);
  // カーソルは動かしたブロックと一緒に動き、続けて打てる。
  await page.keyboard.type("!");
  await expect(body.locator("> p").first()).toHaveText("三!");
  await page.keyboard.press("ControlOrMeta+d");
  await expect(body.locator("> p")).toHaveText(["三!", "三!", "一", "二"]);
  await page.keyboard.type("?");
  await expect(body.locator("> p")).toHaveText(["三!", "三!?", "一", "二"]);

  await placeCursorAtBodyEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("- A");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("A1");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("B");
  await page.keyboard.press("ControlOrMeta+Shift+ArrowUp");
  await expect(body.locator("ul > li > p")).toHaveText(["B", "A", "A1"]);
});

test("持ち手を押すとブロックのメニューが開き、変換・動かす・複製・削除ができる。何行かを選んでいれば、まとめて変換する", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "持ち手のメニュー");
  const body = page.locator(".ProseMirror");
  for (const line of ["一", "二", "三"]) {
    await page.keyboard.type(line);
    await page.keyboard.press("Enter");
  }
  const handle = page.getByRole("button", { name: "ドラッグしてブロックを動かす" });
  const openMenuOf = async (text: string) => {
    await body.locator("p, h2", { hasText: new RegExp(`^${text}$`) }).first().hover();
    await handle.click();
    return page.getByRole("menu");
  };

  let menu = await openMenuOf("二");
  await expect(menu.getByRole("menuitemradio", { name: "本文" })).toHaveAttribute("aria-checked", "true");
  await menu.getByRole("menuitemradio", { name: "見出し 2" }).click();
  await expect(body.locator("h2")).toHaveText("二");

  menu = await openMenuOf("三");
  await menu.getByRole("menuitem", { name: /ブロックを複製/ }).click();
  await expect(body.locator("> p")).toHaveText(["一", "三", "三", ""]);
  menu = await openMenuOf("一");
  await menu.getByRole("menuitem", { name: /ブロックを削除/ }).click();
  await expect(body.locator("> p")).toHaveText(["三", "三", ""]);

  menu = await openMenuOf("二");
  await menu.getByRole("menuitemradio", { name: "本文" }).click();
  await expect(body.locator("> p")).toHaveText(["二", "三", "三", ""]);

  // 何行かを選んでから、そのうちの 1 行の持ち手で「箇条書き」を選ぶと、選んだ行が全部 1 つの箇条書きになる。
  await page.keyboard.press("ControlOrMeta+a");
  menu = await openMenuOf("三");
  await menu.getByRole("menuitemradio", { name: "箇条書き" }).click();
  await expect(body.locator("ul")).toHaveCount(1);
  await expect(body.locator("ul > li > p").first()).toHaveText("二");
});

test("行の左の「＋」を押すと、すぐ下に行を足して「/」の候補を開く", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "＋のメモ");
  await page.keyboard.type("上の行");
  await page.keyboard.press("Enter");
  await page.keyboard.type("下の行");
  const body = page.locator(".ProseMirror");
  await body.locator("p", { hasText: "上の行" }).hover();
  const handleBox = (await page.getByRole("button", { name: "ドラッグしてブロックを動かす" }).boundingBox())!;
  const insertButton = page.getByRole("button", { name: "下にブロックを足す" });
  const insertBox = (await insertButton.boundingBox())!;
  expect(insertBox.x + insertBox.width).toBeLessThanOrEqual(handleBox.x + 1);
  await insertButton.click();
  const slashMenu = page.getByRole("listbox", { name: "ブロックの種類" });
  await expect(slashMenu).toBeVisible();
  await slashMenu.getByRole("option", { name: "見出し 2", exact: true }).click();
  await page.keyboard.type("足した見出し");
  await expect(body.locator("> *")).toHaveText(["上の行", "足した見出し", "下の行"]);
});

// 描き直されている間は位置が取れない（boundingBox が null になる）部品の、位置が取れるまで待った位置。
async function boxAfterRendering(locator: Locator): Promise<NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>> {
  let box = await locator.boundingBox();
  await expect.poll(async () => {
    box = await locator.boundingBox();
    return box !== null;
  }).toBe(true);
  return box!;
}

test("写真の右下の持ち手をドラッグすると幅が変わり、ダブルクリックで本文の幅に合わせる形に戻る", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "写真の大きさ");
  const photo = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#3d7fd6";
    context.fillRect(0, 0, 640, 360);
    return canvas.toDataURL("image/png");
  });
  await page.locator('input[type="file"][accept="image/*"]:not([capture])').setInputFiles({ name: "空.png", mimeType: "image/png", buffer: Buffer.from(photo.split(",")[1]!, "base64") });
  const image = page.locator(".attachment-image img");
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0).catch(() => false)).toBe(true);
  // 写真の要素は、幅を変えると描き直されて一瞬見えなくなるので、見えないときは 0 として待ち直す。
  const imageWidth = async () => Math.round((await image.boundingBox())?.width ?? 0);
  // 写真は幅 640px で、本文の列（648px）に収まるので、そのままの幅で出る。
  const startWidth = 640;
  await expect.poll(imageWidth).toBe(startWidth);
  await image.hover();
  const handle = page.getByRole("button", { name: /写真の大きさを変える/ });
  // 持ち手も写真と一緒に描き直されるので、描き直しの間は位置が取れず、描き直したあとに位置が動くことがある（CI で
  // どちらも落ちた）。hover は、持ち手が動かなくなり、その位置で押せるようになるまで待つ。そのあとの位置を使う。
  await handle.hover();
  const handleBox = await boxAfterRendering(handle);
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  // 写真は中央に置くので、左へ 100px 動かすと、幅は 200px 狭くなる。
  await page.mouse.move(handleBox.x + handleBox.width / 2 - 100, handleBox.y + handleBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(imageWidth).toBe(startWidth - 200);
  const storedWidth = () => page.evaluate(() => {
    const editor = (document.querySelector(".ProseMirror") as HTMLElement & { editor: { getJSON: () => { content: Array<{ type: string; attrs?: { width?: number | null } }> } } }).editor;
    return editor.getJSON().content.find((block) => block.type === "attachmentImage")?.attrs?.width ?? null;
  });
  expect(await storedWidth()).toBe(startWidth - 200);

  await image.hover();
  await handle.dblclick();
  await expect.poll(storedWidth).toBe(null);
  await expect.poll(imageWidth).toBe(startWidth);
});

test("PC では、書式のボタンを上に並べず、文字を選んだときだけその上に出す。表のメニューは表の中にいる間だけ上のバーに出る", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "書式のメモ");
  await page.keyboard.type("大事な文字");
  const selectionToolbar = page.locator(".selection-toolbar");
  await expect(page.getByRole("button", { name: "太字" })).toBeHidden();
  await expect(page.locator(".note-top-bar").getByRole("button", { name: "表", exact: true })).toHaveCount(0);

  // 選んだ文字の上に出る。
  await page.keyboard.press("Shift+Home");
  await expect(selectionToolbar).toBeVisible();
  const toolbarBox = (await selectionToolbar.boundingBox())!;
  const paragraphBox = (await page.locator(".ProseMirror p").first().boundingBox())!;
  expect(toolbarBox.y + toolbarBox.height).toBeLessThanOrEqual(paragraphBox.y);
  await selectionToolbar.getByRole("button", { name: "太字" }).click();
  await expect(page.locator(".ProseMirror strong")).toHaveText("大事な文字");
  // 選ぶのをやめると消える。
  await page.keyboard.press("End");
  await expect(selectionToolbar).toBeHidden();

  // 表の中にいる間だけ、上のバーに表のメニューが出る。
  await page.keyboard.press("Enter");
  await insertFromSlashMenu(page, "表", "表");
  const tableMenuButton = page.locator(".note-top-bar").getByRole("button", { name: "表", exact: true });
  await expect(tableMenuButton).toBeVisible();
  await tableMenuButton.click();
  await expect(page.getByRole("menuitem", { name: "下に行を追加" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".ProseMirror p", { hasText: "大事な文字" }).click();
  await expect(tableMenuButton).toHaveCount(0);
});

test("持ち手は、本文から左の余白を通って近づいても消えず、1 行目の高さにそろう。見出しでは、ズームのボタンと折りたたみの印の左に出る", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "持ち手のメモ");
  await page.keyboard.type("## 見出し");
  await page.keyboard.press("Enter");
  await page.keyboard.type("段落");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- 項目");
  const handle = page.getByRole("button", { name: "ドラッグしてブロックを動かす" });

  for (const block of [page.locator(".ProseMirror > p", { hasText: "段落" }), page.locator(".ProseMirror h2"), page.locator(".ProseMirror li")]) {
    const blockBox = (await block.boundingBox())!;
    const y = blockBox.y + 12;
    // 文字の上から、持ち手のある左の余白まで、少しずつ動かす。
    await page.mouse.move(blockBox.x + 40, y);
    await expect(handle).toBeVisible();
    const handleBox = (await handle.boundingBox())!;
    for (let x = blockBox.x + 40; x > handleBox.x + handleBox.width / 2; x -= 4) {
      await page.mouse.move(x, y);
    }
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await expect(handle).toBeVisible();
    expect(handleBox.width).toBeGreaterThanOrEqual(18);
    expect(handleBox.height).toBeGreaterThanOrEqual(24);
    // 持ち手の縦の中心は、ブロックの 1 行目の中にある。
    const firstLine = (await block.locator("xpath=descendant-or-self::*[self::p or self::h2][1]").boundingBox())!;
    expect(handleBox.y + handleBox.height / 2).toBeGreaterThan(firstLine.y);
    expect(handleBox.y + handleBox.height / 2).toBeLessThan(firstLine.y + firstLine.height);
  }

  // 見出しでは、左から持ち手・ズームのボタン・折りたたみの印の順に並び、重ならない。
  const heading = page.locator(".ProseMirror h2");
  await heading.hover();
  const handleBox = (await handle.boundingBox())!;
  const zoomBox = (await heading.getByRole("button", { name: "このセクションにズーム" }).boundingBox())!;
  const foldBox = (await heading.locator(".fold-toggle").boundingBox())!;
  expect(handleBox.x + handleBox.width).toBeLessThanOrEqual(zoomBox.x);
  expect(zoomBox.x + zoomBox.width).toBeLessThanOrEqual(foldBox.x);
  expect(foldBox.x + foldBox.width).toBeLessThanOrEqual((await heading.boundingBox())!.x);

  // 打ち始めると隠れ、マウスを動かすとまた出る。
  await page.locator(".ProseMirror li").click();
  await page.keyboard.type("を足す");
  await expect(handle).toBeHidden();
  await page.mouse.move(handleBox.x + 60, handleBox.y + 4);
  await expect(handle).toBeVisible();
});

test("「- 」「1. 」などで書式に変わった直後の Backspace は、書式をやめて打った文字に戻す。そのあとは打ち続けても変わらない", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "変換のメモ");
  const body = page.locator(".ProseMirror");
  for (const [typed, convertedSelector] of [["- ", "ul > li"], ["1. ", "ol > li"], ["[ ] ", "ul[data-type=taskList] > li"], ["> ", "blockquote"], ["## ", "h2"]] as const) {
    await page.keyboard.type(typed);
    await expect(body.locator(convertedSelector)).toHaveCount(1);
    await page.keyboard.press("Backspace");
    await expect(body.locator(convertedSelector)).toHaveCount(0);
    await page.keyboard.type("続き");
    await expect(body.locator("p").first()).toHaveText(`${typed}続き`);
    await expect(body.locator(convertedSelector)).toHaveCount(0);
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
  }

  // 本文の途中の行でも戻せる。戻すのは変換の直後だけで、何か打ったあとの Backspace は 1 文字消すだけ。
  await page.keyboard.type("前の行");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("後ろの行");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.type("1. ");
  await page.keyboard.press("Backspace");
  await expect(body.locator("p")).toHaveText(["前の行", "1. ", "後ろの行"]);
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("- 項目");
  await page.keyboard.press("Backspace");
  await expect(body.locator("ul > li")).toHaveText(["項"]);
});

test("グラフ表示は、メモを点、メモ同士のリンクを線にして出し、点を押すとそのメモを開く", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "リンク先");
  await newNote(page, "つながりの無いメモ");
  await newNote(page, "リンク元");
  await insertFromSlashMenu(page, "メモへのリンク", "メモへのリンク");
  await page.getByRole("dialog").getByRole("button", { name: "リンク先" }).click();
  await expect(page.locator(".ProseMirror .note-link button")).toHaveText("リンク先");

  await page.getByRole("button", { name: "グラフ表示" }).click();
  const graph = page.locator(".note-graph");
  await expect(graph).toContainText("メモ 3 件、リンク 1 本");
  await expect(graph.locator(".note-graph-node")).toHaveCount(3);
  await expect(graph.locator(".note-graph-edge")).toHaveCount(1);
  await graph.getByRole("button", { name: "リンク先" }).click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("リンク先");
  await expect(page.getByRole("tab", { name: "グラフ表示" })).toHaveCount(1);
});

test("段落がメモへのリンクだけのときも、リンクの前と後ろに続けて書ける", async ({ page }) => {
  await startLocalVault(page);
  await newNote(page, "旅行の持ち物");
  await newNote(page, "週の予定");
  await insertFromSlashMenu(page, "メモへのリンク", "メモへのリンク");
  await page.getByRole("dialog", { name: "リンクするメモを選ぶ" }).getByRole("button", { name: "旅行の持ち物" }).click();
  const paragraph = page.locator(".ProseMirror p").first();
  await expect(paragraph.locator(".note-link")).toHaveText("旅行の持ち物");

  // 段落の右の空いた所を押して、リンクの後ろにカーソルを置く。
  const box = (await paragraph.boundingBox())!;
  await page.mouse.click(box.x + box.width - 10, box.y + box.height / 2);
  await page.keyboard.type("と傘");
  await page.keyboard.press("Home");
  await page.keyboard.type("持つ物: ");
  await expect(paragraph).toHaveText("持つ物: 旅行の持ち物と傘");
});

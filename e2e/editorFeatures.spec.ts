import { expect, type Page, test } from "@playwright/test";
import { newTestRemoteConfig } from "../integration/testStorage";
import { createNoteOnDesktop, openSyncedDevice, PHONE_VIEWPORT, startLocalVault, syncNowOnDesktop } from "./devices";

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
  await page.getByRole("button", { name: "メモへのリンク" }).click();
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
  await expect(page.locator(".nav-row", { hasText: "すべてのメモ" }).locator(".count")).toHaveText("0");
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
  await chooseTableAction(page, "表を挿入");
  await firstBodyCell(page).click();
  await page.keyboard.type("もと");

  await chooseTableAction(page, "上に行を追加");
  await chooseTableAction(page, "左に列を追加");
  expect(await tableShape(page)).toEqual([["", "", "", ""], ["", "", "", ""], ["", "もと", "", ""], ["", "", "", ""]]);

  // ショートカットで足しても、カーソルは元のセルに残る。
  await page.locator(".ProseMirror td", { hasText: "もと" }).click();
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
  await chooseTableAction(page, "表を挿入");
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
  await chooseTableAction(page, "表を挿入");
  const cells = page.locator(".ProseMirror td");
  await cells.nth(0).click();
  await page.keyboard.type("左");
  // セルの外まで選択を広げると、セルを選んだ状態になる。
  await cells.nth(0).hover();
  await page.mouse.down();
  await cells.nth(1).hover();
  await page.mouse.up();

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
  await chooseTableAction(page, "表を挿入");
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
  await chooseTableAction(page, "表を挿入");
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

  await page.keyboard.press("End");
  await chooseTableAction(page, "表を挿入");
  await firstBodyCell(page).click();
  await page.getByRole("button", { name: "表", exact: true }).click();
  await page.getByRole("button", { name: "青" }).click();
  await expect(page.locator('.ProseMirror td[data-background-color="blue"]')).toHaveCount(1);
});

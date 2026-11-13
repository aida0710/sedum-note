import { type Browser, expect, type Page, test } from "@playwright/test";
import { PHONE_VIEWPORT, startLocalVault } from "./devices";

// スマホの幅の画面で、同期なしの vault を作る。hasTouch を付けると、指で使う端末（pointer: coarse）として開く。
async function openPhone(browser: Browser, { hasTouch = false }: { hasTouch?: boolean } = {}): Promise<Page> {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT, hasTouch })).newPage();
  await startLocalVault(page);
  return page;
}

// スマホの一覧で新しいメモを作り、題を入れる（メモは開いたまま）。
async function openNewNoteOnPhone(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill(title);
}

test("スマホの下のツールバーで、打った文字を元に戻してやり直せる", async ({ browser }) => {
  const page = await openPhone(browser);
  await openNewNoteOnPhone(page, "取り消し");
  const body = page.locator(".ProseMirror");
  const toolbar = page.locator(".editor-bar");
  const undo = toolbar.getByRole("button", { name: "元に戻す" });
  const redo = toolbar.getByRole("button", { name: "やり直す" });
  await expect(undo).toHaveAttribute("aria-disabled", "true");

  await body.click();
  await page.keyboard.type("牛乳を買う");
  await expect(undo).not.toHaveAttribute("aria-disabled", "true");
  await undo.click();
  await expect(body).not.toContainText("牛乳を買う");
  // 押したあとも、本文にカーソルが残る（キーボードが閉じない）。
  await expect(body).toBeFocused();
  await redo.click();
  await expect(body).toContainText("牛乳を買う");
});

test("スマホの下のツールバーで、箇条書きの項目を字下げして戻し、上下に動かせる", async ({ browser }) => {
  const page = await openPhone(browser);
  await openNewNoteOnPhone(page, "字下げ");
  const body = page.locator(".ProseMirror");
  const toolbar = page.locator(".editor-bar");
  const indent = toolbar.getByRole("button", { name: "字下げ", exact: true });
  const outdent = toolbar.getByRole("button", { name: "字下げを戻す" });
  // 箇条書きの外では、字下げのボタンは出さない。
  await body.click();
  await expect(indent).toHaveCount(0);

  await toolbar.getByRole("button", { name: "箇条書き", exact: true }).click();
  await page.keyboard.type("親");
  await page.keyboard.press("Enter");
  await page.keyboard.type("子");
  // 最初の項目は深くできないが、2 つ目は前の項目の中へ入れられる。
  await indent.click();
  await expect(body.locator("ul ul li")).toHaveText("子");
  await expect(body).toBeFocused();
  await outdent.click();
  await expect(body.locator("ul ul")).toHaveCount(0);

  await toolbar.getByRole("button", { name: "ブロックを上へ動かす" }).click();
  await expect(body.locator("ul > li")).toHaveText(["子", "親"]);
  await toolbar.getByRole("button", { name: "ブロックを下へ動かす" }).click();
  await expect(body.locator("ul > li")).toHaveText(["親", "子"]);
});

test("スマホの下のツールバーは、画面に入り切らないとき、続きのある側の端をぼかす", async ({ browser }) => {
  const page = await openPhone(browser);
  await openNewNoteOnPhone(page, "ツールバー");
  const toolbar = page.locator(".editor-bar");
  await expect(toolbar).toHaveAttribute("data-more-end", "");
  await expect(toolbar).not.toHaveAttribute("data-more-start", "");
  expect(await toolbar.evaluate((element) => getComputedStyle(element).maskImage)).toContain("linear-gradient");

  await toolbar.evaluate((element) => element.scrollTo({ left: element.scrollWidth }));
  await expect(toolbar).toHaveAttribute("data-more-start", "");
  await expect(toolbar).not.toHaveAttribute("data-more-end", "");
});

async function backToList(page: Page): Promise<void> {
  await page.getByRole("button", { name: "戻る" }).click();
}

// 下のタブを押す。
async function selectPhoneTab(page: Page, name: string): Promise<void> {
  await page.locator(".tabbar").getByRole("button", { name, exact: true }).click();
}

// 「ノートブック」タブの上のボタンから、ノートブックを足す。
async function addNotebookOnPhone(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "ノートブックを追加" }).click();
  await fillPrompt(page, "ノートブックの名前", name, "作成");
}

// 1 行の入力のダイアログに文字を入れて決める。
async function fillPrompt(page: Page, dialogName: string, text: string, confirmLabel: string): Promise<void> {
  const dialog = page.getByRole("dialog", { name: dialogName });
  await dialog.getByRole("textbox").fill(text);
  await dialog.getByRole("button", { name: confirmLabel }).click();
}

const notebookRow = (page: Page, name: string) => page.locator(".notebook-row", { hasText: name });

async function openNotebookMenu(page: Page, name: string): Promise<void> {
  await notebookRow(page, name).getByRole("button", { name: "その他の操作" }).click();
}

test("スマホのノートブックの行の「…」から、名前の変更・中への追加・色とアイコン・削除ができ、子は親の下に字下げして名前順に並ぶ", async ({ browser }) => {
  const page = await openPhone(browser);
  await selectPhoneTab(page, "ノートブック");
  await addNotebookOnPhone(page, "旅行");
  await addNotebookOnPhone(page, "仕事");

  await openNotebookMenu(page, "旅行");
  await page.getByRole("menuitem", { name: "中にノートブックを追加" }).click();
  await fillPrompt(page, "ノートブックの名前", "京都", "作成");
  // 名前の順（仕事 → 旅行）に並び、子は親のすぐ下に、親より右へ寄せて出る。
  await expect(page.locator(".notebook-row .library-row-label")).toHaveText(["仕事", "旅行", "京都"]);
  const labelLeft = async (name: string) => (await notebookRow(page, name).locator(".library-row-label").boundingBox())!.x;
  expect(await labelLeft("京都")).toBeGreaterThan(await labelLeft("旅行"));

  await openNotebookMenu(page, "仕事");
  await page.getByRole("menuitem", { name: "名前を変更" }).click();
  await fillPrompt(page, "名前を変更", "案件", "保存");
  await expect(page.locator(".notebook-row .library-row-label")).toHaveText(["案件", "旅行", "京都"]);

  await openNotebookMenu(page, "案件");
  await page.getByRole("menuitem", { name: "色とアイコン" }).click();
  const appearance = page.getByRole("dialog", { name: "色とアイコン" });
  await appearance.getByRole("radio", { name: "赤" }).click();
  await appearance.getByRole("button", { name: "閉じる" }).click();
  await expect(notebookRow(page, "案件").locator(".dot")).toHaveCSS("background-color", "rgb(209, 36, 47)");

  // 「中にメモを追加」は、そのノートブックの中にメモを作って開く。
  await openNotebookMenu(page, "京都");
  await page.getByRole("menuitem", { name: "中にメモを追加" }).click();
  await page.getByPlaceholder("タイトル").fill("清水寺");
  await backToList(page);
  await expect(notebookRow(page, "京都").locator(".count")).toHaveText("1");

  await openNotebookMenu(page, "案件");
  await page.getByRole("menuitem", { name: "ノートブックを削除" }).click();
  await page.getByRole("dialog", { name: /「案件」を削除しますか/ }).getByRole("button", { name: "削除" }).click();
  await expect(notebookRow(page, "案件")).toHaveCount(0);
});

test("スマホでノートブックを開くと下のタブは「ノートブック」のままで、「< ノートブック」で一覧へ戻れる。開いているノートブックを削除すると一覧へ戻る", async ({ browser }) => {
  const page = await openPhone(browser);
  await selectPhoneTab(page, "ノートブック");
  await addNotebookOnPhone(page, "旅行");
  await notebookRow(page, "旅行").locator(".notebook-row-open").click();
  await expect(page.getByRole("heading", { name: "旅行" })).toBeVisible();
  await expect(page.locator(".tabbar button.on")).toHaveText("ノートブック");
  // 「＋」は、開いているノートブックの中にメモを作る。
  await openNewNoteOnPhone(page, "持ち物");
  await backToList(page);
  await expect(page.locator(".note-item", { hasText: "持ち物" })).toBeVisible();

  await page.locator(".phone-back", { hasText: "ノートブック" }).click();
  await expect(notebookRow(page, "旅行").locator(".count")).toHaveText("1");

  // 端末の「戻る」でも、ノートブックの一覧へ戻る。
  await notebookRow(page, "旅行").locator(".notebook-row-open").click();
  await expect(page.getByRole("heading", { name: "旅行" })).toBeVisible();
  await page.goBack();
  await expect(notebookRow(page, "旅行")).toBeVisible();
});

test("スマホのゴミ箱の一覧には、ノートブックのチップも「＋」も出ない", async ({ browser }) => {
  const page = await openPhone(browser);
  await openNewNoteOnPhone(page, "捨てるメモ");
  await backToList(page);
  await expect(page.locator(".chips")).toBeVisible();
  await expect(page.getByRole("button", { name: "新しいメモ" })).toBeVisible();

  await selectPhoneTab(page, "ノートブック");
  await page.getByRole("button", { name: /ゴミ箱/ }).click();
  await expect(page.getByRole("heading", { name: "ゴミ箱" })).toBeVisible();
  await expect(page.locator(".chips")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "新しいメモ" })).toHaveCount(0);
});

test("スマホの検索で当たるメモが無いと、探した言葉を添えて知らせ、「×」で検索の文字を消せる", async ({ browser }) => {
  const page = await openPhone(browser);
  await openNewNoteOnPhone(page, "買い物");
  await backToList(page);
  const search = page.getByPlaceholder("メモを検索");
  await expect(search).toHaveAttribute("enterkeyhint", "search");
  await expect(page.getByRole("button", { name: "検索の文字を消去" })).toHaveCount(0);

  await search.fill("見つからない言葉");
  await expect(page.locator(".empty-state")).toHaveText("「見つからない言葉」に当てはまるメモはありません");
  await page.getByRole("button", { name: "検索の文字を消去" }).click();
  await expect(search).toHaveValue("");
  await expect(page.locator(".note-item", { hasText: "買い物" })).toBeVisible();
});

test("スマホの一覧の長い題は「…」で切れ、空白の無い英数字の題でも行が画面の幅より広がらない", async ({ browser }) => {
  const page = await openPhone(browser);
  await openNewNoteOnPhone(page, "a".repeat(120));
  await backToList(page);
  const item = page.locator(".note-item").first();
  const title = item.locator(".note-item-title");
  await expect(title).toHaveCSS("text-overflow", "ellipsis");
  const titleBox = (await title.boundingBox())!;
  expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(PHONE_VIEWPORT.width - 16);
  // 題が切れている（中身の幅のほうが広い）。
  expect(await title.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await item.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("スマホの一覧を下へ送ってメモを開き、戻ると、同じ位置から続きを読める。最後の行は「＋」の下に隠れない", async ({ browser }) => {
  const page = await openPhone(browser);
  for (let index = 1; index <= 14; index += 1) {
    await openNewNoteOnPhone(page, `メモ ${String(index).padStart(2, "0")}`);
    await backToList(page);
  }
  const list = page.locator(".phone-list .phone-scroll");
  await list.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  const scrollTop = await list.evaluate((element) => element.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
  // いちばん下のメモ（最初に作ったもの）の下端が、「＋」の上端より上にある。
  const lastItem = page.locator(".note-item", { hasText: "メモ 01" });
  const lastBox = (await lastItem.boundingBox())!;
  const fabBox = (await page.getByRole("button", { name: "新しいメモ" }).boundingBox())!;
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(fabBox.y);

  await lastItem.click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("メモ 01");
  await backToList(page);
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(scrollTop);
});

test("スマホのメモの中の検索では、検索の欄が 1 行目の幅いっぱいに広がる", async ({ browser }) => {
  const page = await openPhone(browser);
  await openNewNoteOnPhone(page, "検索");
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "メモの中を検索" }).click();
  const findInput = page.getByRole("search").getByLabel("メモの中を検索");
  const inputBox = (await findInput.boundingBox())!;
  // 左の「置換を出す」ボタン（28px）と余白を除いた幅。
  expect(inputBox.width).toBeGreaterThan(PHONE_VIEWPORT.width - 80);
  // 探し方のボタンと「閉じる」は次の行に並び、画面の中に収まる。
  const closeBox = (await page.getByRole("search").getByRole("button", { name: "閉じる" }).boundingBox())!;
  expect(closeBox.y).toBeGreaterThan(inputBox.y + inputBox.height - 1);
  expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(PHONE_VIEWPORT.width);
});

test("スマホでは、名前の長いプロパティがあっても、値の欄が画面の中に収まる", async ({ browser }) => {
  const page = await openPhone(browser);
  await selectPhoneTab(page, "ノートブック");
  await addNotebookOnPhone(page, "読書");
  await openNotebookMenu(page, "読書");
  await page.getByRole("menuitem", { name: "プロパティ" }).click();
  const dialog = page.getByRole("dialog", { name: "プロパティ" });
  await dialog.getByRole("button", { name: "プロパティを追加" }).click();
  const propertyName = "とても長い名前のプロパティで値の欄を外へ押し出していたもの";
  await dialog.getByLabel("名前").fill(propertyName);
  await dialog.getByLabel("名前").press("Enter");
  await dialog.getByRole("button", { name: "閉じる" }).click();

  await openNotebookMenu(page, "読書");
  await page.getByRole("menuitem", { name: "中にメモを追加" }).click();
  const valueBox = (await page.getByLabel(propertyName).boundingBox())!;
  expect(valueBox.x + valueBox.width).toBeLessThanOrEqual(PHONE_VIEWPORT.width);
  // 値の欄は、打てるだけの幅を保つ（直す前は 61px しか見えなかった）。
  expect(valueBox.width).toBeGreaterThan(150);
});




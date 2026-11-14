import { expect, type Page, test } from "@playwright/test";
import { PHONE_VIEWPORT, startLocalVault } from "./devices";

test("PC では左下の歯車で設定を開き、同期の状態を押すと同期のページが開く", async ({ page }) => {
  await startLocalVault(page);
  const settingsPages = page.getByRole("navigation", { name: "設定のページ" });

  await page.getByRole("button", { name: "設定", exact: true }).click();
  await expect(settingsPages.getByRole("button", { name: "一般", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "表示" })).toBeVisible();

  await page.locator(".sync-line").click();
  await expect(settingsPages.getByRole("button", { name: "同期", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("エンドポイント")).toBeVisible();
});

test("スマホの設定は、ページの一覧から開いて「設定」で戻る。ページを開いたまま下のタブで移ると、積んだ「戻る」の履歴も外れる", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(page);
  const tabbar = page.locator(".tabbar");
  const settingsPages = page.getByRole("navigation", { name: "設定のページ" });
  // 開いたページが積む履歴の印（useBackGestureToClose）。無ければ null。
  const historyMark = () => page.evaluate(() => (window.history.state as { mark?: string } | null)?.mark ?? null);

  await tabbar.getByRole("button", { name: "設定" }).click();
  await settingsPages.getByRole("button", { name: /外観/ }).click();
  await expect(page.getByRole("heading", { name: "テーマ" })).toBeVisible();
  await page.locator(".phone-back").click();
  await expect(settingsPages).toBeVisible();
  await expect.poll(historyMark).toBeNull();

  // 端末の「戻る」でも、ページの一覧へ戻る。
  await settingsPages.getByRole("button", { name: /同期/ }).click();
  await expect(page.getByLabel("エンドポイント")).toBeVisible();
  await page.goBack();
  await expect(settingsPages).toBeVisible();

  await settingsPages.getByRole("button", { name: /同期/ }).click();
  await expect.poll(historyMark).not.toBeNull();
  await tabbar.getByRole("button", { name: "メモ" }).click();
  await expect.poll(historyMark).toBeNull();
  // 設定へ戻ると、ページの一覧から始まる。
  await tabbar.getByRole("button", { name: "設定" }).click();
  await expect(settingsPages).toBeVisible();
});

// 設定の項目の、名前（label）と欄の位置。
async function nameAndControlBoxes(page: Page, name: string) {
  const nameBox = await page.locator("label", { hasText: name }).boundingBox();
  const controlBox = await page.getByLabel(name).boundingBox();
  if (!nameBox || !controlBox) {
    throw new Error(`「${name}」の名前か欄が見えていない`);
  }
  return { nameBox, controlBox };
}

test("PC の広い画面では、選択欄とチェックを名前の右に並べる。説明は欄の説明として読み上げる", async ({ page }) => {
  await startLocalVault(page);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await expect(page.getByLabel("本文の配置の既定")).toHaveAccessibleDescription("メモの「…」の「本文の配置」で、メモごとに変えられます。");

  for (const name of ["本文の配置の既定", "打っている行を中央に保つ（タイプライターモード）"]) {
    const { nameBox, controlBox } = await nameAndControlBoxes(page, name);
    expect(controlBox.x).toBeGreaterThan(nameBox.x + nameBox.width);
    // 名前の縦の中央が、欄の上の端と下の端の間にある（同じ行に並んでいる）。
    const nameMiddle = nameBox.y + nameBox.height / 2;
    expect(nameMiddle).toBeGreaterThan(controlBox.y);
    expect(nameMiddle).toBeLessThan(controlBox.y + controlBox.height);
  }
});

test("スマホでは、選択欄を今までどおり名前の下に出し、チェックの印は名前の左に置く。スマホに無い「本文の配置」の既定は出さない", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(page);
  await page.locator(".tabbar").getByRole("button", { name: "設定" }).click();
  await page.getByRole("navigation", { name: "設定のページ" }).getByRole("button", { name: /一般/ }).click();

  const sortOrder = await nameAndControlBoxes(page, "メモの並び順");
  expect(sortOrder.controlBox.y).toBeGreaterThanOrEqual(sortOrder.nameBox.y + sortOrder.nameBox.height);
  await expect(page.getByLabel("本文の配置の既定")).toHaveCount(0);
  const typewriterMode = await nameAndControlBoxes(page, "打っている行を中央に保つ（タイプライターモード）");
  expect(typewriterMode.controlBox.x + typewriterMode.controlBox.width).toBeLessThanOrEqual(typewriterMode.nameBox.x);
});

test("設定のボタンは右にそろい、並べて置くボタンは縦に積んで幅がそろう。選択欄の幅は 1 つ。スマホでは開いているページの名前が上に出る", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 820 } })).newPage();
  await startLocalVault(page);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const selectWidths = await page.locator(".setting-row select").evaluateAll((selects) => selects.map((select) => select.getBoundingClientRect().width));
  expect(new Set(selectWidths).size).toBe(1);

  await page.getByRole("navigation", { name: "設定のページ" }).getByRole("button", { name: "データ", exact: true }).click();
  const markdownButtons = await page.locator(".settings-actions > button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().toJSON() as DOMRect));
  expect(markdownButtons).toHaveLength(4);
  expect(new Set(markdownButtons.map((box) => Math.round(box.width))).size).toBe(1);
  expect(new Set(markdownButtons.map((box) => Math.round(box.right))).size).toBe(1);
  expect(markdownButtons[1]!.top).toBeGreaterThan(markdownButtons[0]!.bottom);

  await page.getByRole("navigation", { name: "設定のページ" }).getByRole("button", { name: "セキュリティ", exact: true }).click();
  const rightEdges = await page.locator(".settings").getByRole("button", { name: /パスフレーズを変更|今すぐロック|このデバイスのデータを消す/ })
    .evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().right)));
  expect(new Set(rightEdges).size).toBe(1);

  const phone = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await startLocalVault(phone);
  await phone.locator(".tabbar").getByRole("button", { name: "設定" }).click();
  await phone.getByRole("navigation", { name: "設定のページ" }).getByRole("button", { name: /データ/ }).click();
  await expect(phone.locator(".phone-top .phone-top-title")).toHaveText("データ");
});

test("開けない記録があると、設定に件数と次の手と記録の ID を出す", async ({ page }) => {
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill("壊れるメモ");
  await page.getByPlaceholder("タイトル").press("Enter");
  // 手元の記録の暗号文を、同じ長さの 0 に置き換えて、復号できなくする。
  const brokenId = await page.evaluate(() => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open("sedum-note");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const store = request.result.transaction("records", "readwrite").objectStore("records");
      const getAll = store.getAll();
      getAll.onsuccess = () => {
        const entry = (getAll.result as Array<{ id: string; sealed: Uint8Array | ArrayBuffer }>)[0]!;
        const length = entry.sealed.byteLength;
        store.put({ ...entry, sealed: entry.sealed instanceof ArrayBuffer ? new ArrayBuffer(length) : new Uint8Array(length) });
        store.transaction.oncomplete = () => resolve(entry.id);
      };
    };
  }));
  await page.reload();
  await page.getByLabel("パスフレーズ").fill("correct horse battery");
  await page.getByRole("button", { name: "解除" }).click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const notice = page.locator(".unreadable-records");
  await expect(notice).toContainText("開けない記録が 1 件あります");
  await expect(notice).toContainText("同期していないので、この記録をほかの場所から取り戻すことはできません。");
  await notice.getByText("開けない記録の ID").click();
  await expect(notice.locator("code")).toHaveText(brokenId);
});

test("設定に保存していない入力を残したまま、ほかのページやタブへ移ろうとすると聞く。やめれば入力が残る", async ({ page }) => {
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await page.getByPlaceholder("タイトル").fill("買い物");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const pages = page.getByRole("navigation", { name: "設定のページ" });
  await pages.getByRole("button", { name: "外観", exact: true }).click();
  const css = page.getByRole("textbox", { name: "カスタム CSS" });
  await css.fill(".ProseMirror { line-height: 2; }");

  // ほかのページへ: やめると、今のページと入力が残る。
  await pages.getByRole("button", { name: "一般", exact: true }).click();
  const confirmation = page.getByRole("dialog").filter({ hasText: "保存していない変更があります" });
  await confirmation.getByRole("button", { name: "キャンセル" }).click();
  await expect(css).toHaveValue(".ProseMirror { line-height: 2; }");

  // ほかのタブへ: 捨ててよいと答えると移る。
  await page.getByRole("tab", { name: "買い物" }).click();
  await confirmation.getByRole("button", { name: "保存せずに移る" }).click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("買い物");

  // 打ちかけが無ければ、聞かずに移る。
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await pages.getByRole("button", { name: "一般", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(pages.getByRole("button", { name: "一般", exact: true })).toHaveAttribute("aria-current", "page");
});

import { expect, type Locator, type Page, test } from "@playwright/test";
import { addNotebookOnDesktop, createNoteOnDesktop, insertBodyHtml, startLocalVault } from "./devices";

// 本文の文字の大きさの既定（px）。ブロックの間は、これに比例する（app.css の --block-gap・--block-gap-loose）。
const BODY_FONT_SIZE = 16;
const NARROW_GAP = BODY_FONT_SIZE * 0.4;
const LOOSE_GAP = BODY_FONT_SIZE;
const DIVIDER_GAP = BODY_FONT_SIZE * 1.5;

async function openNoteWith(page: Page, html: string): Promise<void> {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "見た目の試し");
  await insertBodyHtml(page, html);
}

// 本文の直下のブロックの間（上のブロックの下の端から、下のブロックの上の端まで。px）。ブロックは、その文字で探す。
async function gapBetweenBlocks(page: Page, upperText: string, lowerText: string): Promise<number> {
  const topLevelBlock = (text: string) => page.locator(".ProseMirror > *", { hasText: text }).first();
  const upper = (await topLevelBlock(upperText).boundingBox())!;
  const lower = (await topLevelBlock(lowerText).boundingBox())!;
  return Math.round((lower.y - (upper.y + upper.height)) * 10) / 10;
}

// 要素の中の文字の、左の端（px）。
const textLeftOf = (element: Locator) => element.evaluate((node) => {
  const range = document.createRange();
  range.selectNodeContents(node);
  return Math.round(range.getBoundingClientRect().left);
});

test("ブロックの上下の間は 2 段にそろう。コードの前後は広い間で段落にくっつかず、箇条書きの前後は段落どうしと同じ間になる", async ({ page }) => {
  await openNoteWith(page, [
    "<p>段落A</p><p>段落B</p><ul><li><p>項目C</p></li></ul><p>段落D</p>",
    "<pre><code>コードE</code></pre><p>段落F</p><hr><p>段落G</p>",
    "<blockquote><p>引用H</p></blockquote><table><tr><td>表I</td></tr></table><p>段落J</p>",
  ].join(""));
  expect(await gapBetweenBlocks(page, "段落A", "段落B")).toBe(NARROW_GAP);
  expect(await gapBetweenBlocks(page, "段落B", "項目C")).toBe(NARROW_GAP);
  expect(await gapBetweenBlocks(page, "項目C", "段落D")).toBe(NARROW_GAP);
  expect(await gapBetweenBlocks(page, "段落D", "コードE")).toBe(LOOSE_GAP);
  expect(await gapBetweenBlocks(page, "コードE", "段落F")).toBe(LOOSE_GAP);
  expect(await gapBetweenBlocks(page, "段落G", "引用H")).toBe(LOOSE_GAP);
  expect(await gapBetweenBlocks(page, "引用H", "表I")).toBe(LOOSE_GAP);
  expect(await gapBetweenBlocks(page, "表I", "段落J")).toBe(LOOSE_GAP);

  // 区切り線は、ブラウザの既定の立体の線ではなく 1px の線で、前後は広い間の 1.5 倍あける。
  const divider = page.locator(".ProseMirror hr");
  await expect(divider).toHaveCSS("border-top-style", "solid");
  await expect(divider).toHaveCSS("border-bottom-width", "0px");
  const dividerBox = (await divider.boundingBox())!;
  const before = (await page.locator(".ProseMirror > p", { hasText: "段落F" }).boundingBox())!;
  const after = (await page.locator(".ProseMirror > p", { hasText: "段落G" }).boundingBox())!;
  expect(dividerBox.y - (before.y + before.height)).toBe(DIVIDER_GAP);
  expect(after.y - (dividerBox.y + dividerBox.height)).toBe(DIVIDER_GAP);
});

test("見出しの上の余白は下の約 3 倍で、見出し 4 は本文より大きく、太字の段落と見分けられる", async ({ page }) => {
  await openNoteWith(page, "<p>段落A</p><h2>見出しB</h2><p>段落C</p><h4>見出しD</h4><p><strong>太字の段落E</strong></p>");
  const above = await gapBetweenBlocks(page, "段落A", "見出しB");
  const below = await gapBetweenBlocks(page, "見出しB", "段落C");
  expect(above / below).toBeGreaterThan(2.8);
  expect(above / below).toBeLessThan(3.4);
  const fontSizeOf = (selector: string) => page.locator(selector).first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(await fontSizeOf(".ProseMirror h4")).toBeGreaterThan(await fontSizeOf(".ProseMirror p strong"));
});

test("引用・コールアウト・セルの中の最初と最後のブロックは、入れ物の余白に重ねて間をあけない", async ({ page }) => {
  await openNoteWith(page, "<blockquote><pre><code>引用の中のコード</code></pre></blockquote><div data-callout=\"note\"><pre><code>コールアウトの中のコード</code></pre></div>");
  for (const container of [".ProseMirror blockquote", ".ProseMirror .callout"]) {
    const code = page.locator(`${container} > pre`);
    await expect(code).toHaveCSS("margin-top", "0px");
    await expect(code).toHaveCSS("margin-bottom", "0px");
  }
});

test("チェックした項目の下にある、まだの子の項目には、取り消し線が付かない", async ({ page }) => {
  await openNoteWith(page, '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>済んだ親</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>まだの子</p></li></ul></li></ul>');
  await expect(page.locator(".ProseMirror p", { hasText: "済んだ親" })).toHaveCSS("text-decoration-line", "line-through");
  const child = page.locator(".ProseMirror p", { hasText: "まだの子" });
  await expect(child).toHaveCSS("text-decoration-line", "none");
  // 親の取り消し線は、子の行の上には引かれない（親の線は親の段落だけに付く）。
  expect(await child.evaluate((paragraph) => {
    for (let ancestor = paragraph.parentElement; ancestor && !ancestor.classList.contains("ProseMirror"); ancestor = ancestor.parentElement) {
      if (getComputedStyle(ancestor).textDecorationLine !== "none") {
        return ancestor.tagName;
      }
    }
    return null;
  })).toBeNull();
  await expect(child).toHaveCSS("color", await page.locator(".ProseMirror").evaluate((body) => getComputedStyle(body).color));
});

test("点・番号・チェックの箇条書きは、同じ段の文字の左端がそろう。段組みの中の文字も、前後の段落とそろう", async ({ page }) => {
  const nested = (open: string, close: string, item: (text: string, children: string) => string) => `${open}${item("1 段目", `${open}${item("2 段目", `${open}${item("3 段目", "")}${close}`)}${close}`)}${close}`;
  await openNoteWith(page, [
    "<p>基準の段落</p>",
    nested("<ul>", "</ul>", (text, children) => `<li><p>点 ${text}</p>${children}</li>`),
    nested("<ol>", "</ol>", (text, children) => `<li><p>番号 ${text}</p>${children}</li>`),
    nested('<ul data-type="taskList">', "</ul>", (text, children) => `<li data-type="taskItem" data-checked="false"><p>チェック ${text}</p>${children}</li>`),
    '<div data-columns="2"><div data-column=""><p>左の段</p></div><div data-column=""><p>右の段</p></div></div>',
  ].join(""));
  const paragraph = (text: string) => page.locator(".ProseMirror p", { hasText: text });
  for (const level of ["1 段目", "2 段目", "3 段目"]) {
    const bulletLeft = await textLeftOf(paragraph(`点 ${level}`));
    expect(await textLeftOf(paragraph(`番号 ${level}`))).toBe(bulletLeft);
    expect(await textLeftOf(paragraph(`チェック ${level}`))).toBe(bulletLeft);
  }
  expect(await textLeftOf(paragraph("左の段"))).toBe(await textLeftOf(paragraph("基準の段落")));
});

test("コードは本文より行の間が狭く、長い行は折り返さずに枠の中で横に送る", async ({ page }) => {
  await openNoteWith(page, `<p>本文の段落</p><pre><code>short\nconst veryLongLine = "${"x".repeat(200)}";</code></pre>`);
  const code = page.locator(".ProseMirror pre");
  const lineHeightOf = (element: Locator) => element.evaluate((node) => Number.parseFloat(getComputedStyle(node).lineHeight));
  expect(await lineHeightOf(code)).toBeLessThan(await lineHeightOf(page.locator(".ProseMirror > p").first()));
  expect(await code.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeGreaterThan(0);
  expect(await page.locator(".document-scroll").evaluate((scroll) => scroll.scrollWidth - scroll.clientWidth)).toBe(0);
});

test("長い名前のプロパティがあっても、値の欄は枠の中に収まり、枠の右端まで広がる。スマホの幅でも、値の欄は画面の外へ出ない", async ({ page }) => {
  const longName = "とても長いプロパティの名前で、枠の幅を食いつぶしそうなもの（確認用）";
  await startLocalVault(page);
  await addNotebookOnDesktop(page, "読書");
  await page.locator(".nav-row", { has: page.locator(".nav", { hasText: "読書" }) }).getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "プロパティ" }).click();
  const dialog = page.getByRole("dialog", { name: "プロパティ" });
  await dialog.getByRole("button", { name: "プロパティを追加" }).click();
  await dialog.getByRole("textbox", { name: "名前" }).fill(longName);
  await dialog.getByRole("textbox", { name: "名前" }).press("Enter");
  await dialog.getByRole("button", { name: "閉じる" }).click();
  await page.locator(".nav", { hasText: "読書" }).click();
  await createNoteOnDesktop(page, "本");

  const frame = page.locator(".note-properties");
  const valueInput = page.getByLabel(longName);
  const edges = async () => {
    const frameBox = (await frame.boundingBox())!;
    const inputBox = (await valueInput.boundingBox())!;
    const labelBox = (await frame.locator("label").boundingBox())!;
    return { frameBox, inputBox, labelBox };
  };
  const desktop = await edges();
  // 名前の列は枠の 4 割まで。値の欄は、その右から枠の右端（中の余白 12px と枠線の手前）まで。
  expect(desktop.labelBox.width).toBeLessThanOrEqual(desktop.frameBox.width * 0.4);
  expect(desktop.inputBox.width).toBeGreaterThan(desktop.frameBox.width * 0.5);
  expect(Math.round(desktop.frameBox.x + desktop.frameBox.width - (desktop.inputBox.x + desktop.inputBox.width))).toBe(13);

  // スマホの幅でも、名前は 4 割までで折り返し、値の欄は打てるだけの幅で枠の中に収まる
  // （スマホの組み方に切り替わると、開いていたメモの画面のまま組み直される）。
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".phone")).toBeVisible();
  await page.locator(".phone").getByText("本", { exact: true }).first().click();
  await expect(valueInput).toBeVisible();
  const phone = await edges();
  expect(phone.labelBox.width).toBeLessThanOrEqual(phone.frameBox.width * 0.4);
  expect(phone.inputBox.x + phone.inputBox.width).toBeLessThanOrEqual(phone.frameBox.x + phone.frameBox.width);
  expect(phone.inputBox.width).toBeGreaterThan(phone.frameBox.width * 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test("タグの多いメモでは、本文の上のタグは最初の 5 個だけを出し、「+N」を押すと全部が出る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "タグの多いメモ");
  await insertBodyHtml(page, `<p>${Array.from({ length: 30 }, (_unused, index) => `#タグ${index + 1}`).join(" ")}</p>`);
  const tagChips = page.locator(".document-meta .chip", { hasText: /^#/ });
  await expect(tagChips).toHaveCount(5);
  const titleTopWhenCollapsed = (await page.getByPlaceholder("タイトル").boundingBox())!.y;
  await page.getByRole("button", { name: "ほかのタグを表示（25個）" }).click();
  await expect(tagChips).toHaveCount(30);
  expect((await page.getByPlaceholder("タイトル").boundingBox())!.y).toBeGreaterThan(titleTopWhenCollapsed);
  await page.getByRole("button", { name: "タグを折りたたむ" }).click();
  await expect(tagChips).toHaveCount(5);
});

test("作ったばかりの空のメモには文字数と更新日時を出さず、書き始めると出る", async ({ page }) => {
  await startLocalVault(page);
  await page.getByRole("button", { name: "新しいメモ" }).click();
  await expect(page.getByPlaceholder("タイトル")).toBeFocused();
  await expect(page.locator(".document-meta .character-count")).toHaveCount(0);
  await expect(page.locator(".document-meta .updated")).toHaveCount(0);
  await page.keyboard.type("題");
  await expect(page.locator(".document-meta .character-count")).toHaveText("0 文字");
  await expect(page.locator(".document-meta .updated")).toBeVisible();
});

// 箇条書きの 1 段の字下げ（app.css の --list-indent）。
const LIST_INDENT = 24;

test("持ち手は、段落・見出し・チェックリストで同じ横の位置に出て、箇条書きの項目は 1 段ごとに字下げの分だけ右に出る", async ({ page }) => {
  await openNoteWith(page, '<p>段落</p><h2>見出し</h2><ul><li><p>点 1 段目</p><ul><li><p>点 2 段目</p></li></ul></li></ul><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>チェック</p></li></ul>');
  const handle = page.getByRole("button", { name: "ドラッグしてブロックを動かす" });
  const handleLeftAt = async (block: Locator) => {
    const box = (await block.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 10);
    await expect(handle).toBeVisible();
    return Math.round((await handle.boundingBox())!.x);
  };
  const paragraph = await handleLeftAt(page.locator(".ProseMirror > p", { hasText: "段落" }));
  expect(await handleLeftAt(page.locator(".ProseMirror h2"))).toBe(paragraph);
  expect(await handleLeftAt(page.locator("li", { hasText: "チェック" }))).toBe(paragraph);
  expect(await handleLeftAt(page.locator("li > p", { hasText: "点 1 段目" }))).toBe(paragraph + LIST_INDENT);
  expect(await handleLeftAt(page.locator("li > p", { hasText: "点 2 段目" }))).toBe(paragraph + LIST_INDENT * 2);
});

// 番号と印の間に残す隙間（px）。フォントの違い（WebKit など）で番号の幅が少し変わっても重ならないよう、余裕を見る。
const FOLD_TOGGLE_CLEARANCE = 4;

test("番号が 2 桁の項目でも、折りたたみの印が番号に重ならない", async ({ page }) => {
  const items = Array.from({ length: 10 }, (_unused, index) => `<li><p>番号 ${index + 1}</p>${index === 9 ? "<ol><li><p>子</p></li></ol>" : ""}</li>`).join("");
  await openNoteWith(page, `<ol>${items}</ol>`);
  const item = page.locator(".ProseMirror > ol > li").nth(9);
  await item.locator(":scope > p").hover();
  const fold = (await item.locator(":scope > .fold-toggle").boundingBox())!;
  const itemLeft = (await item.boundingBox())!.x;
  // 番号（「10.」）は、項目の左端の手前に、番号の文字の幅だけ出る。
  const numberWidth = await item.evaluate((element) => {
    const context = document.createElement("canvas").getContext("2d")!;
    context.font = getComputedStyle(element).font;
    return context.measureText("10.").width;
  });
  expect(fold.x + fold.width + FOLD_TOGGLE_CLEARANCE).toBeLessThanOrEqual(itemLeft - numberWidth);
});

test("スマホの幅でも、箇条書きと番号付きの項目の折りたたみの印は、画面の左の端からはみ出さない", async ({ browser }) => {
  for (const width of [390, 360]) {
    const page = await (await browser.newContext({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true })).newPage();
    await startLocalVault(page);
    await page.locator(".fab").click();
    await page.getByPlaceholder("タイトル").fill("スマホの印");
    await page.getByPlaceholder("タイトル").press("Enter");
    await insertBodyHtml(page, "<ul><li><p>点</p><ul><li><p>点の子</p></li></ul></li></ul><ol><li><p>番号</p><ol><li><p>番号の子</p></li></ol></li></ol>");
    for (const list of ["ul", "ol"]) {
      const fold = (await page.locator(`.ProseMirror > ${list} > li > .fold-toggle`).boundingBox())!;
      expect(fold.x, `${width}px の ${list}`).toBeGreaterThanOrEqual(0);
    }
    await page.context().close();
  }
});

test("AI チャットを開いて本文の欄が狭くなると、右の余白を詰めて文字の幅を残す。左の余白（持ち手の場所）はそのまま", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 820 });
  await openNoteWith(page, "<p>狭い欄の本文</p>");
  const documentBox = async () => page.locator(".document").evaluate((element) => {
    const style = getComputedStyle(element);
    return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight) };
  });
  const wide = await documentBox();
  await page.keyboard.press("Control+Alt+A");
  await expect(page.locator(".ai-chat")).toBeVisible();
  await expect.poll(async () => (await documentBox()).right).toBeLessThan(wide.right);
  expect((await documentBox()).left).toBe(wide.left);
  await page.keyboard.press("Control+Alt+A");
  await expect.poll(async () => (await documentBox()).right).toBe(wide.right);
});

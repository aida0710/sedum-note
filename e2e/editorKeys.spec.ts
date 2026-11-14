import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, insertBodyHtml, placeCursorInBlock, startLocalVault } from "./devices";

// 本文のブロックの種類と文字（上から順）。
const bodyBlocks = (page: Page) => page.evaluate(() => {
  const body = document.querySelector(".ProseMirror") as HTMLElement & { editor: { getJSON: () => { content?: Array<{ type: string; content?: unknown[] }> } } };
  const textOf = (node: unknown): string => {
    const { text, content } = node as { text?: string; content?: unknown[] };
    return text ?? (content ?? []).map(textOf).join("");
  };
  return (body.editor.getJSON().content ?? []).map((block) => `${block.type}:${textOf(block)}`);
});

async function openNoteWith(page: Page, html: string): Promise<void> {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "キーの試し");
  await insertBodyHtml(page, html);
}

test("↓ で区切り線に移ってから打っても、区切り線は消えず、打った文字はすぐ下の行に入る。数式でも同じ", async ({ page }) => {
  await openNoteWith(page, "<p>線の上</p><hr><p>線の下</p><div data-block-math=\"x^2\"></div><p>末尾</p>");
  await placeCursorInBlock(page, "線の上", "end");
  await page.keyboard.press("ArrowDown");
  // 選んだ区切り線は、見た目で分かる。
  await expect(page.locator(".ProseMirror hr.ProseMirror-selectednode")).toHaveCSS("outline-style", "solid");
  await page.keyboard.type("8月");
  expect(await bodyBlocks(page)).toEqual(["paragraph:線の上", "horizontalRule:", "paragraph:8月", "paragraph:線の下", "blockMath:", "paragraph:末尾"]);

  await placeCursorInBlock(page, "線の下", "end");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.type("式の下");
  expect(await bodyBlocks(page)).toEqual(["paragraph:線の上", "horizontalRule:", "paragraph:8月", "paragraph:線の下", "blockMath:", "paragraph:式の下", "paragraph:末尾"]);
});

test("選んだ区切り線の上で日本語の変換を始めても、区切り線は消えず、確定した文字はすぐ下の行に入る", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "変換は Chromium の DevTools で作る");
  await openNoteWith(page, "<p>線の上</p><hr><p>線の下</p>");
  await placeCursorInBlock(page, "線の上", "end");
  await page.keyboard.press("ArrowDown");
  const devTools = await page.context().newCDPSession(page);
  await devTools.send("Input.imeSetComposition", { text: "にほんご", selectionStart: 4, selectionEnd: 4 });
  await devTools.send("Input.insertText", { text: "日本語" });
  await expect.poll(() => bodyBlocks(page)).toEqual(["paragraph:線の上", "horizontalRule:", "paragraph:日本語", "paragraph:線の下"]);
});

test("表のすぐ下の段落の先頭で Backspace を押しても表は消えず、カーソルが最後のセルの末尾へ移る。空の段落なら、その行を消して移る", async ({ page }) => {
  await openNoteWith(page, "<table><tr><th>品目</th><th>数</th></tr><tr><td>りんご</td><td>3</td></tr></table><p>表の下</p><p></p><p>末尾</p>");
  await placeCursorInBlock(page, "表の下", "start");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect(page.locator(".ProseMirror table")).toHaveCount(1);
  // 1 回目で最後のセルの末尾へ移り、2 回目はセルの中の 1 文字を消す。
  await expect(page.locator(".ProseMirror td").last()).toHaveText("");
  await page.keyboard.type("5");
  await expect(page.locator(".ProseMirror td").last()).toHaveText("5");
  expect(await bodyBlocks(page)).toEqual(["table:品目数りんご5", "paragraph:表の下", "paragraph:", "paragraph:末尾"]);

  // 表のすぐ下を空の段落にしてから、その先頭で Backspace。
  await page.locator(".ProseMirror p", { hasText: "表の下" }).evaluate((paragraph) => getSelection()?.selectAllChildren(paragraph));
  await page.keyboard.press("Delete");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("個");
  await expect(page.locator(".ProseMirror td").last()).toHaveText("5個");
  expect(await bodyBlocks(page)).toEqual(["table:品目数りんご5個", "paragraph:", "paragraph:末尾"]);
});

test("表のすぐ上の段落の末尾で Delete を押しても表は消えず、カーソルが最初のセルの先頭へ移る", async ({ page }) => {
  await openNoteWith(page, "<p>表の上</p><table><tr><td>りんご</td><td>3</td></tr></table>");
  await placeCursorInBlock(page, "表の上", "end");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Delete");
  // 1 回目で最初のセルの先頭へ移り、2 回目はセルの中の 1 文字を消す。
  expect(await bodyBlocks(page)).toEqual(["paragraph:表の上", "table:んご3", "paragraph:"]);
});

test("見出しとコードの先頭の Backspace は、前の段落につなげず、段落に戻す。コードは行ごとの段落になる", async ({ page }) => {
  await openNoteWith(page, "<p>前の段落</p><h2>見出し</h2><pre><code>一行目\n二行目</code></pre>");
  await placeCursorInBlock(page, "見出し", "start");
  await page.keyboard.press("Backspace");
  expect(await bodyBlocks(page)).toEqual(["paragraph:前の段落", "paragraph:見出し", "codeBlock:一行目\n二行目", "paragraph:"]);
  await placeCursorInBlock(page, "一行目", "start");
  await page.keyboard.press("Backspace");
  expect(await bodyBlocks(page)).toEqual(["paragraph:前の段落", "paragraph:見出し", "paragraph:一行目", "paragraph:二行目", "paragraph:"]);
  // 段落に戻したあとの Backspace は、ふつうに前の段落とつなぐ。
  await page.keyboard.press("Backspace");
  expect(await bodyBlocks(page)).toEqual(["paragraph:前の段落", "paragraph:見出し一行目", "paragraph:二行目", "paragraph:"]);
});

test("「$x^2$」と打つと数式になり、閉じの「$」は本文に残らない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "数式");
  await page.keyboard.type("値は $x^2$ です");
  await expect(page.locator(".ProseMirror .math-inline")).toHaveCount(1);
  await expect(page.locator(".ProseMirror p").first()).toHaveText(/^値は .* です$/);
  await expect(page.locator(".ProseMirror p").first()).not.toContainText("$");
});

test("「==文字==」と打つとハイライトになる", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "ハイライト");
  await page.keyboard.type("ここが ==大事== です");
  await expect(page.locator(".ProseMirror mark")).toHaveText("大事");
  await expect(page.locator(".ProseMirror p").first()).toHaveText("ここが 大事 です");
});

test("日本語入力のままの「＃ 」「＞ 」「［］ 」でも見出し・引用・チェックリストになり、直後の Backspace で打った文字に戻る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "全角の記号");
  await page.keyboard.type("＃＃　");
  await page.keyboard.type("見出し");
  await expect(page.locator(".ProseMirror h2")).toHaveText("見出し");
  await page.keyboard.press("Enter");
  await page.keyboard.type("＞　");
  await page.keyboard.type("引用");
  await expect(page.locator(".ProseMirror blockquote")).toHaveText("引用");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("［］　");
  await page.keyboard.type("買い物");
  await expect(page.locator('.ProseMirror ul[data-type="taskList"] li p')).toHaveText("買い物");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("＃　");
  await expect(page.locator(".ProseMirror h1")).toHaveCount(1);
  await page.keyboard.press("Backspace");
  await expect(page.locator(".ProseMirror h1")).toHaveCount(0);
  await expect(page.locator(".ProseMirror p", { hasText: "＃" })).toHaveText("＃　");
});

test("チェックリストの項目の中の Ctrl+Enter は、改行を入れずに、チェックを付け外しする", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "チェック");
  await page.keyboard.type("[ ] 牛乳を買う");
  const item = page.locator('.ProseMirror ul[data-type="taskList"] li');
  await page.keyboard.press("Control+Enter");
  await expect(item).toHaveAttribute("data-checked", "true");
  await page.keyboard.press("Control+Enter");
  await expect(item).toHaveAttribute("data-checked", "false");
  await expect(item.locator("br:not(.ProseMirror-trailingBreak)")).toHaveCount(0);
});

test("コードと表のセルの中の Ctrl+A は、1 回目で中身だけ、2 回目で本文全体を選ぶ", async ({ page }) => {
  await openNoteWith(page, "<p>前の段落</p><pre><code>一行目\n二行目</code></pre><table><tr><td>りんご</td><td>みかん</td></tr></table>");
  const selectedText = () => page.evaluate(() => {
    const body = document.querySelector(".ProseMirror") as HTMLElement & { editor: { state: { selection: { from: number; to: number }; doc: { textBetween: (from: number, to: number, separator: string) => string } } } };
    const { selection, doc } = body.editor.state;
    return doc.textBetween(selection.from, selection.to, "|");
  });
  await placeCursorInBlock(page, "一行目", "start");
  await page.keyboard.press("Control+a");
  expect(await selectedText()).toBe("一行目\n二行目");
  await page.keyboard.press("Control+a");
  expect(await selectedText()).toContain("前の段落");

  await placeCursorInBlock(page, "りんご", "end");
  await page.keyboard.press("Control+a");
  expect(await selectedText()).toBe("りんご");
  await page.keyboard.press("Control+a");
  expect(await selectedText()).toContain("みかん");
});

test("文字を選んだときのボタンは Esc で消え、選択は残る。ズームしている間の、その Esc では、ズームから戻らない", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "選択のボタン");
  await page.keyboard.type("- 大事な項目");
  await page.keyboard.press("Control+.");
  const zoomBackButton = page.getByRole("button", { name: /^「.*」に戻る$/ });
  await expect(zoomBackButton).toBeVisible();
  await page.keyboard.press("Shift+Home");
  const selectionToolbar = page.locator(".selection-toolbar");
  await expect(selectionToolbar).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(selectionToolbar).toBeHidden();
  await expect(zoomBackButton).toBeVisible();
  // 選択は残っているので、そのまま打つと置き換わる。
  expect(await page.evaluate(() => getSelection()?.toString())).toBe("大事な項目");
  // ボタンが消えたあとの Esc は、ズームから戻る。
  await page.keyboard.press("Escape");
  await expect(zoomBackButton).toHaveCount(0);

  // 選び直すと、また出る。
  await placeCursorInBlock(page, "大事な項目", "end");
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(selectionToolbar).toBeVisible();
});

test("持ち手のメニューの「変換」には、「/」と同じく見出し 1〜6 が並び、見出し 4 のブロックでは「見出し 4」に印が付く", async ({ page }) => {
  await openNoteWith(page, "<h4>小さな見出し</h4><p>段落</p>");
  await page.locator(".ProseMirror h4").hover();
  await page.getByRole("button", { name: "ドラッグしてブロックを動かす" }).click();
  const menu = page.getByRole("menu");
  for (const level of [1, 2, 3, 4, 5, 6]) {
    await expect(menu.getByRole("menuitemradio", { name: `見出し ${level}` })).toHaveAttribute("aria-checked", String(level === 4));
  }
  await menu.getByRole("menuitemradio", { name: "見出し 6" }).click();
  await expect(page.locator(".ProseMirror h6")).toHaveText("小さな見出し");
});

test("チェックボックスの読み上げの名前は、その項目の行の文字だけで、画面の言語になる", async ({ page }) => {
  await openNoteWith(page, '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>親の項目</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>子の項目</p></li></ul></li></ul>');
  await expect(page.getByRole("checkbox", { name: "「親の項目」のチェックボックス", exact: true })).toHaveCount(1);
  await expect(page.getByRole("checkbox", { name: "「子の項目」のチェックボックス", exact: true })).toHaveCount(1);
});

test("表示した数式は Tab で来られ、Enter で編集を始められる", async ({ page }) => {
  await openNoteWith(page, '<p>式の上</p><div data-block-math="x^2"></div>');
  const renderedMath = page.locator(".ProseMirror .math-block .math-rendered");
  await expect(renderedMath).toHaveAttribute("tabindex", "0");
  await renderedMath.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "数式" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "数式" })).toHaveValue("x^2");
});

test("本文の下の余白や左右の余白を押すと、本文にカーソルが入り、続けて打てる", async ({ page }) => {
  await openNoteWith(page, "<p>一行目</p><p>二行目</p>");
  const bodyBox = (await page.locator(".ProseMirror").boundingBox())!;
  const scrollBox = (await page.locator(".document-scroll").boundingBox())!;
  const secondLine = (await page.locator(".ProseMirror p", { hasText: "二行目" }).boundingBox())!;

  // 本文より下の余白: 末尾へ。
  await page.getByPlaceholder("タイトル").click();
  await page.mouse.click(bodyBox.x + 100, scrollBox.y + scrollBox.height - 20);
  await expect(page.locator(".ProseMirror")).toBeFocused();
  await page.keyboard.type("の末尾");
  await expect(page.locator(".ProseMirror p").last()).toHaveText("二行目の末尾");

  // 本文の右の余白: 同じ高さの行の末尾へ。左の余白: 行の先頭へ。
  await page.getByPlaceholder("タイトル").click();
  await page.mouse.click(scrollBox.x + scrollBox.width - 30, secondLine.y + secondLine.height / 2);
  await expect(page.locator(".ProseMirror")).toBeFocused();
  await page.keyboard.type("！");
  await expect(page.locator(".ProseMirror p").last()).toHaveText("二行目の末尾！");
  await page.getByPlaceholder("タイトル").click();
  await page.mouse.click(scrollBox.x + 12, secondLine.y + secondLine.height / 2);
  await page.keyboard.type("★");
  await expect(page.locator(".ProseMirror p").last()).toHaveText("★二行目の末尾！");

  // 題のまわりの余白では、本文へ移らない。
  await page.getByPlaceholder("タイトル").click();
  await page.mouse.click(scrollBox.x + 12, bodyBox.y - 30);
  await expect(page.locator(".ProseMirror")).not.toBeFocused();
});

test("書式の無い文字を貼り付けると、空の行は空の段落として残り、最初の行は今の行の続きに入る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "貼り付け");
  await page.keyboard.type("前置き：");
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "一行目\n二行目\n\n四行目\n");
    document.querySelector(".ProseMirror")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  });
  expect(await bodyBlocks(page)).toEqual(["paragraph:前置き：一行目", "paragraph:二行目", "paragraph:", "paragraph:四行目"]);
  // 貼ったあとのカーソルは、最後の行の末尾にある。
  await page.keyboard.type("の続き");
  expect(await bodyBlocks(page)).toEqual(["paragraph:前置き：一行目", "paragraph:二行目", "paragraph:", "paragraph:四行目の続き"]);
});

test("文字を選んだときのボタンから開いた色のメニューは、Esc でメニューだけが閉じ、ボタンは残る", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "選択のボタン");
  await page.keyboard.type("大事な文字");
  await page.keyboard.press("Shift+Home");
  const selectionToolbar = page.locator(".selection-toolbar");
  await selectionToolbar.getByRole("button", { name: "ハイライト" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(selectionToolbar).toBeVisible();
});

// 箇条書きの項目を、深さの分の字下げつきで上から並べる（「  二」は 1 段深い項目）。
const listOutline = (page: Page) => page.evaluate(() => {
  const lines: string[] = [];
  const visit = (list: Element, depth: number) => {
    for (const item of list.querySelectorAll(":scope > li")) {
      lines.push(`${"  ".repeat(depth)}${item.querySelector(":scope > p, :scope > div > p")?.textContent ?? ""}`);
      for (const child of item.querySelectorAll(":scope > ul, :scope > ol, :scope > div > ul")) visit(child, depth + 1);
    }
  };
  for (const list of document.querySelectorAll(".ProseMirror > ul, .ProseMirror > ol")) visit(list, 0);
  return lines;
});

// fromText で始まる文字のブロックの先頭から、toText で始まる文字のブロックの末尾までを選ぶ。
async function selectBlocks(page: Page, fromText: string, toText: string): Promise<void> {
  await page.evaluate(({ from, to }) => {
    type TextblockNode = { isTextblock: boolean; textContent: string; content: { size: number } };
    const body = document.querySelector(".ProseMirror") as HTMLElement & {
      editor: { state: { doc: { descendants: (visit: (node: TextblockNode, position: number) => boolean) => void } }; commands: { setTextSelection: (range: { from: number; to: number }) => boolean }; view: { focus: () => void } };
    };
    let start: number | null = null;
    let end: number | null = null;
    body.editor.state.doc.descendants((node, position) => {
      if (node.isTextblock && start === null && node.textContent.startsWith(from)) start = position + 1;
      if (node.isTextblock && node.textContent.startsWith(to)) end = position + 1 + node.content.size;
      return true;
    });
    body.editor.commands.setTextSelection({ from: start!, to: end! });
    body.editor.view.focus();
  }, { from: fromText, to: toText });
}

test("何項目かにまたがって選んで Tab を押すと、選んだ項目が全部 1 段深くなり、Shift+Tab で全部戻る", async ({ page }) => {
  await openNoteWith(page, "<ul><li><p>一</p></li><li><p>二</p></li><li><p>三</p></li><li><p>四</p></li></ul>");
  await selectBlocks(page, "二", "三");
  await page.keyboard.press("Tab");
  await expect.poll(() => listOutline(page)).toEqual(["一", "  二", "  三", "四"]);
  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => listOutline(page)).toEqual(["一", "二", "三", "四"]);
});

// 空の項目の先頭の Backspace は、まず 1 段浅くし（ほかのアプリと同じ）、もう 1 回で前の項目の末尾へつなげて消す。
test("空の子の項目を Backspace で消しても、前後の項目の深さは変わらない", async ({ page }) => {
  await openNoteWith(page, "<ul><li><p>一</p><ul><li><p>二</p></li><li><p></p></li><li><p>三</p></li></ul></li><li><p>四</p></li></ul>");
  await page.evaluate(() => {
    type TextblockNode = { isTextblock: boolean; content: { size: number } };
    const body = document.querySelector(".ProseMirror") as HTMLElement & {
      editor: { state: { doc: { descendants: (visit: (node: TextblockNode, position: number) => boolean) => void } }; commands: { setTextSelection: (position: number) => boolean }; view: { focus: () => void } };
    };
    let emptyItem: number | null = null;
    body.editor.state.doc.descendants((node, position) => {
      if (emptyItem === null && node.isTextblock && node.content.size === 0) emptyItem = position + 1;
      return emptyItem === null;
    });
    body.editor.commands.setTextSelection(emptyItem!);
    body.editor.view.focus();
  });
  await page.keyboard.press("Backspace");
  await expect.poll(() => listOutline(page)).toEqual(["一", "  二", "", "  三", "四"]);
  await page.keyboard.press("Backspace");
  await expect.poll(() => listOutline(page)).toEqual(["一", "  二", "  三", "四"]);
  await page.keyboard.type("の続き");
  await expect.poll(() => listOutline(page)).toEqual(["一", "  二の続き", "  三", "四"]);
});

test("見出しの末尾の Enter でできた行は段落で、Tab を押しても見出しにも箇条書きにもならない", async ({ page }) => {
  await openNoteWith(page, "<h2>見出し</h2>");
  await placeCursorInBlock(page, "見出し", "end");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("見出しの下の行");
  // 3 つ目は、見出しで終わる本文に付いていた空の段落（TrailingNode）。
  expect(await bodyBlocks(page)).toEqual(["heading:見出し", "paragraph:見出しの下の行", "paragraph:"]);
});

test("文字を選んだときのボタンで書式を付けても、選択とボタンの並びは残り、続けて別の書式も付けられる", async ({ page }) => {
  await openNoteWith(page, "<p>書式を付ける文</p>");
  await selectBlocks(page, "書式を付ける文", "書式を付ける文");
  const toolbar = page.locator(".selection-toolbar");
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: "太字" }).click();
  await expect(page.locator(".ProseMirror strong")).toHaveText("書式を付ける文");
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: "斜体" }).click();
  await expect(page.locator(".ProseMirror strong em, .ProseMirror em strong")).toHaveText("書式を付ける文");
  const selectedText = await page.evaluate(() => window.getSelection()?.toString());
  expect(selectedText).toBe("書式を付ける文");
});

for (const lastBlock of [
  { name: "表", html: "<p>上の段落</p><table><tbody><tr><td><p>セル</p></td></tr></tbody></table>" },
  { name: "コード", html: "<p>上の段落</p><pre><code>const value = 1;</code></pre>" },
]) {
  test(`最後が${lastBlock.name}のメモでも、本文の下の余白を押すと、その後ろの行にカーソルが入って書ける`, async ({ page }) => {
    await openNoteWith(page, lastBlock.html);
    await page.getByPlaceholder("タイトル").click();
    const scrollBox = (await page.locator(".document-scroll").boundingBox())!;
    const bodyBox = (await page.locator(".ProseMirror").boundingBox())!;
    await page.mouse.click(bodyBox.x + 100, scrollBox.y + scrollBox.height - 20);
    await expect(page.locator(".ProseMirror")).toBeFocused();
    await page.keyboard.type("後ろに書いた文");
    expect((await bodyBlocks(page)).at(-1)).toBe("paragraph:後ろに書いた文");
  });
}

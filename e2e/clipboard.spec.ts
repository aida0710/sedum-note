import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, insertBodyHtml, placeCursorAtBodyEnd, placeCursorInBlock, startLocalVault, textOfBlockAtCursor } from "./devices";

// 貼り付け・コピー・切り取りと、そのあとの取り消し。ほかのメモのアプリが直してきた形（Craft・Bear・UpNote・Obsidian の更新履歴）を、
// 本物のクリップボードとキーで確かめる。クリップボードの読み書きは Chromium の権限で行う（WebKit は権限を与えられないので流さない）。
test.skip(({ browserName }) => browserName !== "chromium", "クリップボードの読み書きは Chromium の権限で行う");
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

// 本文のブロックの種類と文字（上から順）。入れ子の箇条書きは、項目ごとに「listItem:文字」と深さの分の字下げで並べる。
// 見出しや箇条書きで終わる本文には、その下に書けるよう空の段落が付く（TrailingNode）ので、末尾の空の段落は並べない。
const bodyOutline = (page: Page) => page.evaluate(() => {
  type JsonNode = { type: string; text?: string; content?: JsonNode[]; attrs?: Record<string, unknown> };
  const body = document.querySelector(".ProseMirror") as HTMLElement & { editor: { getJSON: () => JsonNode } };
  const textOf = (node: JsonNode): string => node.text ?? (node.content ?? []).filter((child) => !["bulletList", "orderedList", "taskList"].includes(child.type)).map(textOf).join("");
  const lines: string[] = [];
  const visit = (node: JsonNode, depth: number) => {
    if (["bulletList", "orderedList", "taskList"].includes(node.type)) {
      for (const item of node.content ?? []) {
        lines.push(`${"  ".repeat(depth)}${item.type}:${textOf(item)}`);
        for (const child of item.content ?? []) visit(child, depth + 1);
      }
      return;
    }
    if (depth === 0) lines.push(`${node.type}:${textOf(node)}`);
  };
  for (const block of body.editor.getJSON().content ?? []) visit(block, 0);
  return lines.at(-1) === "paragraph:" && lines.length > 1 ? lines.slice(0, -1) : lines;
});

const linksInBody = (page: Page) => page.locator(".ProseMirror a").evaluateAll((links) => links.map((link) => `${link.textContent}→${link.getAttribute("href")}`));

async function writeClipboard(page: Page, text: string): Promise<void> {
  await page.evaluate((value) => navigator.clipboard.writeText(value), text);
}

async function openNote(page: Page, title = "貼り付けの試し"): Promise<void> {
  await startLocalVault(page);
  await createNoteOnDesktop(page, title);
}

test("URL を続けて貼ると、URL ごとに別のリンクになり、1 つのリンクにまとまらない", async ({ page }) => {
  await openNote(page);
  await writeClipboard(page, "https://example.com/first");
  await page.keyboard.press("ControlOrMeta+v");
  await page.keyboard.type(" ");
  await writeClipboard(page, "https://example.com/second");
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(() => linksInBody(page)).toEqual([
    "https://example.com/first→https://example.com/first",
    "https://example.com/second→https://example.com/second",
  ]);
});

test("文字を選んで URL を貼ると、選んだ文字がそのリンクになる", async ({ page }) => {
  await openNote(page);
  await page.keyboard.type("公式のページ");
  await page.keyboard.press("Shift+Home");
  await writeClipboard(page, "https://example.com/");
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(() => linksInBody(page)).toEqual(["公式のページ→https://example.com/"]);
});

// 貼ったあとに空白や Enter を打つと、打った URL と同じく autolink でリンクになる。貼った時点では文字のままかを見る。
test("Ctrl+Shift+V で貼ると、Markdown の記号はそのままの文字で入り、URL はリンクにならない", async ({ page }) => {
  await openNote(page);
  await writeClipboard(page, "## 見出しにしない\n**太字** と - 記号");
  await page.keyboard.press("ControlOrMeta+Shift+v");
  await page.keyboard.press("Enter");
  await writeClipboard(page, "https://example.com/plain");
  await page.keyboard.press("ControlOrMeta+Shift+v");
  await expect.poll(() => bodyOutline(page)).toEqual(["paragraph:## 見出しにしない", "paragraph:**太字** と - 記号", "paragraph:https://example.com/plain"]);
  await expect(page.locator(".ProseMirror a")).toHaveCount(0);
  await expect(page.locator(".ProseMirror strong")).toHaveCount(0);
});

test("「- 」付きの行を箇条書きの項目の中へ貼ると、印が二重にならず、同じ段の項目として並ぶ", async ({ page }) => {
  await openNote(page);
  await page.keyboard.type("- 一つ目");
  await page.keyboard.press("Enter");
  await writeClipboard(page, "- 二つ目\n- 三つ目");
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(() => bodyOutline(page)).toEqual(["listItem:一つ目", "listItem:二つ目", "listItem:三つ目"]);
});

test("複数行の箇条書きを貼っても、入れ子の深さが崩れない", async ({ page }) => {
  await openNote(page);
  await writeClipboard(page, "- 親\n  - 子\n    - 孫\n- 次の親");
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(() => bodyOutline(page)).toEqual(["listItem:親", "  listItem:子", "    listItem:孫", "listItem:次の親"]);
});

test("表のセルへ複数行の文字を貼ると、そのセルの中に入り、表の形は変わらない", async ({ page }) => {
  await openNote(page);
  await insertBodyHtml(page, "<table><tbody><tr><th><p>見出し</p></th><th><p>値</p></th></tr><tr><td><p>一</p></td><td><p>二</p></td></tr></tbody></table><p>表の下</p>");
  await placeCursorInBlock(page, "二", "end");
  await writeClipboard(page, "一行目\n二行目");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.locator(".ProseMirror tr")).toHaveCount(2);
  await expect(page.locator(".ProseMirror td").nth(1)).toHaveText("二一行目二行目");
  await expect(page.locator(".ProseMirror td").nth(1).locator("p")).toHaveCount(2);
  expect((await bodyOutline(page)).at(-1)).toBe("paragraph:表の下");
});

test("表の中でセルの文字を切り取っても、表は残る。セルを何個か選んで切り取ると、中身だけが消える", async ({ page }) => {
  await openNote(page);
  await insertBodyHtml(page, "<table><tbody><tr><th><p>品目</p></th><th><p>金額</p></th></tr><tr><td><p>ペン</p></td><td><p>800</p></td></tr></tbody></table><p>表の下</p>");
  await placeCursorInBlock(page, "ペン", "end");
  await page.keyboard.press("Shift+Home");
  await page.keyboard.press("ControlOrMeta+x");
  await expect(page.locator(".ProseMirror table")).toHaveCount(1);
  await expect(page.locator(".ProseMirror td").first()).toHaveText("");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("ペン");

  // 1 行目の 2 つのセルを、押してから Shift を押しながら押して選び、切り取る。
  await page.locator(".ProseMirror th").first().click();
  await page.locator(".ProseMirror th").nth(1).click({ modifiers: ["Shift"] });
  await expect(page.locator(".ProseMirror .selectedCell")).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+x");
  await expect(page.locator(".ProseMirror table")).toHaveCount(1);
  await expect(page.locator(".ProseMirror tr")).toHaveCount(2);
  await expect(page.locator(".ProseMirror th")).toHaveText(["", ""]);
  await expect(page.locator(".ProseMirror td").nth(1)).toHaveText("800");
});

test("何も選ばずに Ctrl+C を押しても、クリップボードの中身は消えない", async ({ page }) => {
  await openNote(page);
  await page.keyboard.type("本文の文字");
  await writeClipboard(page, "前にコピーした文字");
  await page.keyboard.press("ControlOrMeta+c");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("前にコピーした文字");
  await insertBodyHtml(page, "<table><tbody><tr><td><p>セル</p></td></tr></tbody></table>");
  await placeCursorInBlock(page, "セル", "end");
  await page.keyboard.press("ControlOrMeta+c");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("前にコピーした文字");
});

test("貼り付けのあとの Ctrl+Z 1 回で、貼った分だけが消え、直前に打った文字は残る", async ({ page }) => {
  await openNote(page);
  await page.keyboard.type("打った文字");
  await writeClipboard(page, "貼った一行目\n貼った二行目");
  // 打った直後（取り消しのまとまりの時間の中）に貼る。
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(() => bodyOutline(page)).toEqual(["paragraph:打った文字貼った一行目", "paragraph:貼った二行目"]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => bodyOutline(page)).toEqual(["paragraph:打った文字"]);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => bodyOutline(page)).toEqual(["paragraph:打った文字貼った一行目", "paragraph:貼った二行目"]);
});

test("Markdown を貼ったあとの Ctrl+Z 1 回で、書式に変えた分もまとめて戻る", async ({ page }) => {
  await openNote(page);
  await page.keyboard.type("前の段落");
  await page.keyboard.press("Enter");
  await writeClipboard(page, "## 見出し\n\n- 項目 1\n- 項目 2");
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(() => bodyOutline(page)).toEqual(["paragraph:前の段落", "heading:見出し", "listItem:項目 1", "listItem:項目 2"]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => bodyOutline(page)).toEqual(["paragraph:前の段落"]);
});

test("見出しの中へ書式の無い文字を貼っても、見出しのまま。2 行目からは段落になる", async ({ page }) => {
  await openNote(page);
  await page.keyboard.type("## ");
  await writeClipboard(page, "見出しに貼る文字");
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(() => bodyOutline(page)).toEqual(["heading:見出しに貼る文字"]);
  await page.keyboard.press("Enter");
  await page.keyboard.type("## ");
  await writeClipboard(page, "二つ目の見出し\n続きの段落");
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(() => bodyOutline(page)).toEqual(["heading:見出しに貼る文字", "heading:二つ目の見出し", "paragraph:続きの段落"]);
});

test("行の端の空白は、貼っても消えない", async ({ page }) => {
  await openNote(page);
  await writeClipboard(page, "後ろに空白  \n  前に空白");
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(() => bodyOutline(page)).toEqual(["paragraph:後ろに空白  ", "paragraph:  前に空白"]);
});

test("たたんだ見出しを含めてコピーして貼ると、隠れていた中身も入る", async ({ page }) => {
  await openNote(page);
  await insertBodyHtml(page, "<p>前の段落</p><h2>たたむ見出し</h2><p>隠れる中身</p><h2>次の見出し</h2>");
  const heading = page.locator(".ProseMirror h2", { hasText: "たたむ見出し" });
  await heading.hover();
  await heading.getByRole("button", { name: /折りたたむ/ }).click();
  await expect(page.locator(".ProseMirror p", { hasText: "隠れる中身" })).toBeHidden();
  // 前の段落の頭から、次の見出しの手前までを選んでコピーし、末尾に貼る。
  await placeCursorInBlock(page, "前の段落", "start");
  await page.evaluate(() => {
    const body = document.querySelector(".ProseMirror") as HTMLElement & { editor: { state: { doc: { content: { size: number }; child: (index: number) => { nodeSize: number } } }; commands: { setTextSelection: (range: { from: number; to: number }) => boolean } } };
    const { doc } = body.editor.state;
    const endOfHiddenParagraph = doc.child(0).nodeSize + doc.child(1).nodeSize + doc.child(2).nodeSize - 1;
    body.editor.commands.setTextSelection({ from: 1, to: endOfHiddenParagraph });
  });
  await page.keyboard.press("ControlOrMeta+c");
  await placeCursorAtBodyEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+v");
  const outline = await bodyOutline(page);
  expect(outline.slice(-3)).toEqual(["paragraph:前の段落", "heading:たたむ見出し", "paragraph:隠れる中身"]);
});

test("チェックリストの項目の文字を押しても、チェックは切り替わらず、その文字にカーソルが入る", async ({ page }) => {
  await openNote(page);
  await page.keyboard.type("[] 牛乳を買う");
  const item = page.locator(".ProseMirror li[data-checked]");
  await expect(item).toHaveAttribute("data-checked", "false");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("下の段落");
  await item.locator("p").click({ position: { x: 30, y: 8 } });
  await expect(item).toHaveAttribute("data-checked", "false");
  await page.keyboard.type("!");
  await expect(item.locator("p")).toContainText("!");
});

test("表の 1 行目で ↑ を押すと、表のすぐ上の行へ移る", async ({ page }) => {
  await openNote(page);
  await page.keyboard.type("表の上の行");
  await page.keyboard.press("Enter");
  await insertBodyHtml(page, "<table><tbody><tr><td><p>左</p></td><td><p>右</p></td></tr><tr><td><p>下の左</p></td><td><p>下の右</p></td></tr></tbody></table>");
  await placeCursorInBlock(page, "右", "end");
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => textOfBlockAtCursor(page)).toBe("表の上の行");
  await page.keyboard.type("!");
  await expect(page.locator(".ProseMirror > p").first()).toContainText("!");
  await expect(page.locator(".ProseMirror td", { hasText: /^右$/ })).toHaveCount(1);
});

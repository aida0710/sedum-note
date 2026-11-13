import { expect, type Page, test } from "@playwright/test";
import { createNoteOnDesktop, insertBodyHtml, startLocalVault } from "./devices";

async function openNewNote(page: Page): Promise<void> {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "ブロックの試し");
}

const slashMenu = (page: Page) => page.getByRole("listbox", { name: "ブロックの種類" });

test("「/」を打つとブロックの候補が出て、上下のキーと Enter で選べる", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("/");
  // 録音は、録音できるブラウザでだけ候補に出る。
  const canRecord = await page.evaluate(() => typeof MediaRecorder !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function");
  await expect(slashMenu(page).getByRole("option")).toHaveText([
    "本文", "見出し 1", "見出し 2", "見出し 3", "見出し 4", "見出し 5", "見出し 6", "箇条書き", "番号付きリスト", "チェックリスト", "引用",
    "コールアウト: 情報", "コールアウト: ヒント", "コールアウト: 注意", "コールアウト: 警告", "コード", "表", "区切り線",
    "画像を貼る", "ファイルを添付", ...(canRecord ? ["録音する"] : []), "書類のスキャン", "期限（チェックリストの項目に付ける）", "今日の日付", "今の日時", "2 段組み", "3 段組み", "埋め込み（動画・Web ページ）", "脚注", "数式", "図（Mermaid）", "手書き・図形", "クエリ（条件に合うメモの一覧）", "メモへのリンク", "ブロックへのリンク", "ブロックの埋め込み（ほかのメモの一部を出す）",
  ]);
  // 候補は枠より長いが、スクロールバーは出さない（バーの分だけ中身の幅が狭くならない）。
  const scrollbar = await slashMenu(page).evaluate((menu: HTMLElement) => ({
    setting: getComputedStyle(menu).scrollbarWidth, takenWidth: menu.offsetWidth - menu.clientWidth, isScrollable: menu.scrollHeight > menu.clientHeight,
  }));
  expect(scrollbar).toEqual({ setting: "none", takenWidth: 2, isScrollable: true });
  await page.keyboard.press("ArrowDown");
  await expect(slashMenu(page).getByRole("option", { name: "見出し 1" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(slashMenu(page)).toHaveCount(0);
  await page.keyboard.type("大きな見出し");
  // 打った「/」は残らない。
  await expect(page.locator(".ProseMirror h1")).toHaveText("大きな見出し");
});

test("「/」のあとに打った文字で候補を絞り込める（文言でも、英語の言葉でも）", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("/表");
  await expect(slashMenu(page).getByRole("option")).toHaveText(["表"]);
  await page.keyboard.press("Enter");
  await expect(page.locator(".ProseMirror table tr")).toHaveCount(3);
  await expect(page.locator(".ProseMirror")).not.toContainText("/表");

  await page.keyboard.press("Control+End");
  await page.keyboard.type("/todo");
  await expect(slashMenu(page).getByRole("option")).toHaveText(["チェックリスト"]);
  await page.keyboard.press("Enter");
  await page.keyboard.type("牛乳を買う");
  await expect(page.locator('.ProseMirror ul[data-type="taskList"] li > div')).toHaveText("牛乳を買う");
});

test("候補を押して選べ、文の途中の「/」からも出せる。全角の「／」でも出る", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("メモ /");
  await slashMenu(page).getByRole("option", { name: "区切り線" }).click();
  await expect(page.locator(".ProseMirror hr")).toHaveCount(1);
  await expect(page.locator(".ProseMirror p").first()).toHaveText("メモ");

  await page.keyboard.type("／");
  await slashMenu(page).getByRole("option", { name: "引用" }).click();
  await page.keyboard.type("引用した文");
  await expect(page.locator(".ProseMirror blockquote")).toHaveText("引用した文");
});

test("Escape で候補を閉じると「/」はそのまま残り、コードの中と URL の「/」では候補を出さない", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("/");
  await expect(slashMenu(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(slashMenu(page)).toHaveCount(0);
  await expect(page.locator(".ProseMirror p").first()).toHaveText("/");

  await page.keyboard.press("Enter");
  await page.keyboard.type("https://example.com/path");
  await expect(slashMenu(page)).toHaveCount(0);

  await page.keyboard.press("Enter");
  await page.keyboard.type("/コード");
  await page.keyboard.press("Enter");
  await page.keyboard.type("a / b");
  await expect(slashMenu(page)).toHaveCount(0);
  await expect(page.locator(".ProseMirror pre")).toHaveText("a / b");
});

test("当たる候補が無いときは「見つかりません」を出し、Enter はそのまま改行になる。パスを打っている間は何も出さない", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("/zzzz");
  await expect(slashMenu(page)).toHaveText("見つかりません");
  await expect(slashMenu(page).getByRole("option")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(slashMenu(page)).toHaveCount(0);
  await expect(page.locator(".ProseMirror p")).toHaveText(["/zzzz", ""]);

  await page.keyboard.type("/usr/local");
  await expect(slashMenu(page)).toHaveCount(0);
});

test("窓の中ほどで「/」を打っても、候補は打っている行を覆わず、上下の空きに収まる", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openNewNote(page);
  await insertBodyHtml(page, Array.from({ length: 7 }, (_unused, index) => `<p>段落 ${index + 1}</p>`).join(""));
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  await expect(slashMenu(page)).toBeVisible();
  const typedLine = (await page.locator(".ProseMirror p", { hasText: /^\/$/ }).boundingBox())!;
  // 打った行は、窓の中ほどにある（下にも上にも、候補の全部は入らない）。
  expect(typedLine.y).toBeGreaterThan(380);
  expect(typedLine.y).toBeLessThan(520);
  const menuBox = (await slashMenu(page).boundingBox())!;
  const coversTypedLine = menuBox.y < typedLine.y + typedLine.height && menuBox.y + menuBox.height > typedLine.y;
  expect(coversTypedLine).toBe(false);
  expect(menuBox.y).toBeGreaterThanOrEqual(0);
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(900);
  // 収まらない分は、候補の中で送れる。
  await page.keyboard.press("ArrowUp");
  await expect(slashMenu(page).getByRole("option").last()).toBeInViewport();
});

test("候補から「メモへのリンク」を選ぶと、リンクするメモを選ぶ画面が開く", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("/めも");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "リンクするメモを選ぶ" })).toBeVisible();
});

test("「/」からコールアウトを作れ、中に文字を書ける。別の種類を選ぶと色が変わる", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("/こーるあうと");
  await slashMenu(page).getByRole("option", { name: "コールアウト: 注意" }).click();
  await page.keyboard.type("火を止める");
  const callout = page.locator(".ProseMirror .callout");
  await expect(callout).toHaveText("火を止める");
  await expect(callout).toHaveAttribute("data-callout", "warning");

  await page.keyboard.type(" /こーるあうと");
  await slashMenu(page).getByRole("option", { name: "コールアウト: 警告" }).click();
  await expect(callout).toHaveCount(1);
  await expect(callout).toHaveAttribute("data-callout", "danger");
});

test("クエリのブロックは、条件に合うメモの一覧を出し、条件を変えると一覧が変わる。押すとそのメモが開く", async ({ page }) => {
  await startLocalVault(page);
  await createNoteOnDesktop(page, "旅行の持ち物");
  await page.keyboard.type("パスポート #旅行");
  await createNoteOnDesktop(page, "買い物");
  await page.keyboard.type("牛乳");
  await createNoteOnDesktop(page, "まとめ");
  await page.keyboard.type("/くえり");
  await page.keyboard.press("Enter");

  const query = page.locator(".ProseMirror .note-query");
  await expect(query.locator(".note-query-results .menu-item")).toHaveCount(3);
  await query.getByRole("combobox", { name: "タグ" }).selectOption("旅行");
  await expect(query.locator(".note-query-results .menu-item")).toHaveText(["旅行の持ち物"]);
  await query.getByRole("combobox", { name: "タグ" }).selectOption("");
  await query.getByRole("textbox", { name: "含まれる言葉" }).fill("牛乳");
  await expect(query.locator(".note-query-results .menu-item")).toHaveText(["買い物"]);
  await query.locator(".note-query-results .menu-item").click();
  await expect(page.getByPlaceholder("タイトル")).toHaveValue("買い物");
});

test("「/」から数式を入れて LaTeX を書くと、数式として表示される。行の中では $...$ と打つと数式になる", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("/すうしき");
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "数式" }).fill("E = mc^2");
  await page.keyboard.press("Control+Enter");
  const blockMath = page.locator(".ProseMirror .math-block");
  await expect(blockMath.locator(".katex")).toBeVisible();
  await expect(blockMath.locator(".math-rendered")).toHaveAttribute("title", "E = mc^2");

  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("面積は $\\pi r^2$ です");
  const inlineMath = page.locator(".ProseMirror .math-inline");
  await expect(inlineMath.locator(".katex")).toBeVisible();
  await expect(inlineMath.locator(".math-rendered")).toHaveAttribute("title", "\\pi r^2");
  await expect(page.locator(".ProseMirror")).toContainText("面積は");
});

test("「/」から図を入れると Mermaid の図が出る。カーソルが外にある間は元の文字が隠れ、図を押すと元の文字が出て書き直せる", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("/mermaid");
  await page.keyboard.press("Enter");
  const diagram = page.locator(".ProseMirror .mermaid-diagram");
  await expect(diagram.locator("svg")).toBeVisible();
  await expect(diagram).toContainText("はじめ");

  // 入れた直後はカーソルが中にあるので、元の文字が見えている。外へ出ると隠れる。
  const source = page.locator(".ProseMirror pre");
  await expect(source).toBeVisible();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.keyboard.type("図の下の文");
  await expect(source).toBeHidden();

  await diagram.click();
  await expect(source).toBeVisible();
  // 図を押すと、カーソルは元の文字の先頭に来る。2 行目の末尾に、矢印を 1 つ足す。
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.type(" --> C[かえた]");
  await expect(diagram).toContainText("かえた");
});

test("「/」から段組みを入れると、ブロックを横に並べて書ける。空の段には「ここに書く」が出る", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("/だんぐみ");
  await slashMenu(page).getByRole("option", { name: "2 段組み" }).click();
  const columns = page.locator(".ProseMirror .column");
  await expect(columns).toHaveCount(2);
  // 空の段には「ここに書く」を薄く出し、書くと消える。
  const emptyColumns = page.locator(".ProseMirror .column p.empty-column");
  await expect(emptyColumns).toHaveCount(2);
  await expect(emptyColumns.first()).toHaveAttribute("data-placeholder", "ここに書く");
  await page.keyboard.type("左の段");
  await expect(emptyColumns).toHaveCount(1);
  await columns.nth(1).click();
  await page.keyboard.type("右の段");
  await expect(columns).toHaveText(["左の段", "右の段"]);

  const boxes = async () => Promise.all([columns.nth(0).boundingBox(), columns.nth(1).boundingBox()]);
  const [left, right] = await boxes();
  expect(right!.x).toBeGreaterThan(left!.x + left!.width - 1);
  expect(Math.abs(right!.y - left!.y)).toBeLessThan(2);

});

test("「/」から脚注を入れると、本文に番号の印が付き、本文の下で脚注の文を書ける。印を押すと、その文の欄へ移る", async ({ page }) => {
  await openNewNote(page);
  await page.keyboard.type("最初の文 /きゃくちゅう");
  await page.keyboard.press("Enter");
  const footnotes = page.getByRole("region", { name: "脚注" });
  // 入れた直後は、脚注の文の欄にカーソルがある。
  await expect(footnotes.getByRole("textbox", { name: "脚注 1 の文" })).toBeFocused();
  await page.keyboard.type("出典は 1 章");
  await expect(page.locator(".ProseMirror .footnote-reference")).toHaveAttribute("title", "出典は 1 章");

  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" 次の文 /きゃくちゅう");
  await page.keyboard.press("Enter");
  await page.keyboard.type("2 つ目の注");
  await expect(footnotes.getByRole("textbox")).toHaveCount(2);
  await expect(footnotes.getByRole("textbox", { name: "脚注 2 の文" })).toHaveValue("2 つ目の注");

  await page.locator(".ProseMirror .footnote-reference").first().click();
  await expect(footnotes.getByRole("textbox", { name: "脚注 1 の文" })).toBeFocused();
});

test("埋め込みは、URL を入れても外へつながず、「読み込む」を押したときに初めて枠の中に読み込む", async ({ page }) => {
  // 試験では外へつながない。枠の中に読み込む要求だけを見て、空のページを返す。
  const requestedUrls: string[] = [];
  await page.route("https://www.youtube-nocookie.com/**", async (route) => {
    requestedUrls.push(route.request().url());
    await route.fulfill({ contentType: "text/html", body: "<title>video</title>" });
  });
  await openNewNote(page);
  await page.keyboard.type("/うめこみ");
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "埋め込む URL" }).fill("http://example.com/");
  await expect(page.getByText("https:// で始まる URL を入れてください")).toBeVisible();
  await page.getByRole("textbox", { name: "埋め込む URL" }).fill("https://www.youtube.com/watch?v=abcdefghijk");
  await page.keyboard.press("Enter");

  const embed = page.locator(".ProseMirror .embed");
  await expect(embed.locator(".embed-url")).toHaveText("https://www.youtube.com/watch?v=abcdefghijk");
  await expect(embed.locator("iframe")).toHaveCount(0);
  expect(requestedUrls).toEqual([]);

  await embed.getByRole("button", { name: "読み込む" }).click();
  await expect(embed.locator("iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/abcdefghijk");
  await expect.poll(() => requestedUrls).toEqual(["https://www.youtube-nocookie.com/embed/abcdefghijk"]);
});

import { describe, expect, it } from "vitest";
import { looksLikeMarkdown, markdownInClipboard } from "./pastedMarkdown";

function clipboard(contents: Record<string, string>): Pick<DataTransfer, "getData"> {
  return { getData: (type) => contents[type] ?? "" };
}

describe("貼り付けた文字が Markdown かの見分け", () => {
  it.each([
    ["見出し", "# 題名\n本文"],
    ["箇条書き", "買うもの\n- 牛乳\n- 卵"],
    ["番号付きリスト", "1. 準備\n2. 実行"],
    ["チェックリスト", "- [ ] やること"],
    ["引用", "> 引用した文"],
    ["コードの囲み", "```js\nconst x = 1;\n```"],
    ["表", "| a | b |\n|---|---|\n| 1 | 2 |"],
    ["区切り線", "上\n\n---\n\n下"],
    ["太字", "ここが **大事** です"],
    ["リンク", "[公式サイト](https://example.com) を見る"],
    ["行の中のコード", "`npm ci` を実行する"],
  ])("%s を Markdown と見る", (_name, text) => {
    expect(looksLikeMarkdown(text)).toBe(true);
  });

  it.each([
    ["普通の文", "明日の会議は 10 時からです。\n場所は 3 階。"],
    ["タグ", "#買い物 のメモ"],
    ["引き算と掛け算", "10 - 3 = 7、2 * 3 = 6"],
    ["URL だけ", "https://example.com/a_b_c"],
  ])("%s は Markdown と見ない", (_name, text) => {
    expect(looksLikeMarkdown(text)).toBe(false);
  });
});

describe("クリップボードからの Markdown の取り込み", () => {
  it("文字だけで届いた Markdown を取り込む", () => {
    expect(markdownInClipboard(clipboard({ "text/plain": "# 題名" }))).toBe("# 題名");
  });

  it("書式つき（HTML）で届いたものは、既定の貼り付けに任せる", () => {
    expect(markdownInClipboard(clipboard({ "text/plain": "# 題名", "text/html": "<h1>題名</h1>" }))).toBeNull();
  });

  it("VS Code の Markdown のファイルからのコピーは、HTML が付いていても取り込む", () => {
    const fromVscode = { "text/plain": "- 項目", "text/html": "<div>- 項目</div>", "vscode-editor-data": JSON.stringify({ mode: "markdown" }) };
    expect(markdownInClipboard(clipboard(fromVscode))).toBe("- 項目");
  });

  it("VS Code のほかの言語からのコピーは、既定の貼り付けに任せる", () => {
    const fromVscode = { "text/plain": "# comment\nx = 1", "text/html": "<div># comment</div>", "vscode-editor-data": JSON.stringify({ mode: "python" }) };
    expect(markdownInClipboard(clipboard(fromVscode))).toBeNull();
  });

  it("Markdown の書き方が無い文字は取り込まない", () => {
    expect(markdownInClipboard(clipboard({ "text/plain": "ただの文です。" }))).toBeNull();
    expect(markdownInClipboard(null)).toBeNull();
  });
});

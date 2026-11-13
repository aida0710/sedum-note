// 貼り付けた文字が Markdown なら、書式つきの本文として入れる。

import type { Editor, JSONContent } from "@tiptap/react";
import { type MarkdownImportContext, markdownToBodyBlocks } from "../markdown/markdownDocument";
import { insertListAsSiblingItems } from "./pastedListItems";
import { PASTED_CONTENT_META } from "./pasteUndoStep";

// VS Code がコピーのときに付ける種類。中身は JSON で、mode にコピー元の言語が入る。
const VSCODE_CLIPBOARD_TYPE = "vscode-editor-data";

// 行の先頭に来る Markdown の書き方（見出し、リスト、引用、コードの囲み、区切り線、表の区切りの行）。
// 「#タグ」はこのアプリのタグなので、見出しは「#」のあとに空白があるものだけにする。
const BLOCK_SYNTAX = /^(?: {0,3}#{1,6} \S| {0,3}> ?\S|\s*(?:[-*+]|\d+[.)]) \S| {0,3}(?:```|~~~)| {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$| {0,3}\|?(?: ?:?-{3,}:? ?\|)+(?: ?:?-{3,}:? ?)?\s*$)/m;
// 行の中に来る Markdown の書き方（太字、リンク・画像、コード、取り消し線）。
const INLINE_SYNTAX = /\*\*[^*\n]+\*\*|!?\[[^\]\n]+\]\([^)\s]+\)|`[^`\n]+`|~~[^~\n]+~~/;

export function looksLikeMarkdown(text: string): boolean {
  return BLOCK_SYNTAX.test(text) || INLINE_SYNTAX.test(text);
}

function vscodeLanguage(clipboard: Pick<DataTransfer, "getData">): string | null {
  const editorData = clipboard.getData(VSCODE_CLIPBOARD_TYPE);
  if (editorData === "") {
    return null;
  }
  try {
    return String((JSON.parse(editorData) as { mode?: unknown }).mode ?? "");
  } catch {
    return "";
  }
}

// クリップボードの文字を Markdown として取り込むなら、その文字を返す。
// 書式つき（HTML）で届いたものは、エディタの既定の貼り付けが書式を保つので取り込まない。
// VS Code からのコピーは HTML も付くので、コピー元の言語で決める（Markdown 以外は、既定の処理がコードにする）。
export function markdownInClipboard(clipboard: Pick<DataTransfer, "getData"> | null): string | null {
  const text = clipboard?.getData("text/plain") ?? "";
  if (clipboard === null || text.trim() === "") {
    return null;
  }
  const language = vscodeLanguage(clipboard);
  if (language !== null) {
    return language === "markdown" ? text : null;
  }
  if (clipboard.getData("text/html") !== "") {
    return null;
  }
  return looksLikeMarkdown(text) ? text : null;
}

// 段落 1 つだけなら、その中身を今の行の途中に入れる（ブロックのまま入れると、行が前後に分かれる）。
function contentToInsert(blocks: JSONContent[]): JSONContent[] {
  const onlyBlock = blocks.length === 1 ? blocks[0] : undefined;
  return onlyBlock?.type === "paragraph" ? onlyBlock.content ?? [] : blocks;
}

export type PastedMarkdownContext = Pick<MarkdownImportContext, "noteExists">;

export async function insertPastedMarkdown(editor: Editor, markdown: string, context: PastedMarkdownContext): Promise<void> {
  // 貼り付けた文字にファイルは付いてこないので、添付にできるリンク先は無い。
  const blocks = await markdownToBodyBlocks(markdown, { ...context, attachFile: async () => null }, "drop");
  editor.commands.focus();
  if (insertListAsSiblingItems(editor, blocks)) {
    return;
  }
  editor.chain().insertContent(contentToInsert(blocks)).setMeta(PASTED_CONTENT_META, true).run();
}

// AI の答えで、頼んだときに選んでいた所を入れ替える。選んだあとに本文が変わり、その範囲がもう同じ文字でなければ
// 入れ替えない（別の所を書き換えてしまわないように）。
//   1 行の答え: 文字のまま入れ替える（選んだ所が段落の途中でも、段落を分けない）。
//   何行かの答え: Markdown として読み、書式つきで入れ替える（貼り付けと同じ）。

import type { Editor } from "@tiptap/react";
import type { AiAttachment } from "./aiConversation";
import { insertPastedMarkdown, type PastedMarkdownContext } from "../editor/pastedMarkdown";

export type SelectionAttachment = Extract<AiAttachment, { kind: "selection" }>;

// 入れ替えられる範囲を持つ、選んだ文字の添付か（位置を持たない古い会話の添付や、ほかのメモの選択は除く）。
export function isReplaceableSelection(attachment: AiAttachment, noteId: string): attachment is SelectionAttachment & { from: number; to: number } {
  return attachment.kind === "selection" && attachment.noteId === noteId && attachment.from !== undefined && attachment.to !== undefined;
}

// 入れ替えたら true。範囲の文字が変わっていたら false。
export async function replaceSelectedText(editor: Editor, selection: SelectionAttachment & { from: number; to: number }, answer: string, context: PastedMarkdownContext): Promise<boolean> {
  const { doc } = editor.state;
  if (selection.to > doc.content.size || doc.textBetween(selection.from, selection.to, "\n") !== selection.text) {
    return false;
  }
  const text = answer.trim();
  if (!text.includes("\n")) {
    return editor.chain().focus().insertContentAt({ from: selection.from, to: selection.to }, { type: "text", text }).run();
  }
  editor.chain().focus().setTextSelection({ from: selection.from, to: selection.to }).run();
  await insertPastedMarkdown(editor, text, context);
  return true;
}

// 本文の中の期限の印（「📅 2026-11-15 09:00」。core/notes/dueTimes.ts）を目立たせ、チェックリストの項目に
// 期限の印を付ける・変える・外す。

import { type Editor, Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { type EditorState, Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { dueMarkText, findDueMark } from "../../core/notes/dueTimes";

// 文字でないノード（メモへのリンクなど）を、位置の数え方が合うように 1 文字として読む。
const INLINE_NODE_PLACEHOLDER = "￼";

function lineText(textBlock: ProseMirrorNode): string {
  return textBlock.textBetween(0, textBlock.content.size, undefined, INLINE_NODE_PLACEHOLDER);
}

function dueMarkDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, position) => {
    if (!node.isTextblock) {
      return true;
    }
    const mark = findDueMark(lineText(node));
    if (mark) {
      decorations.push(Decoration.inline(position + 1 + mark.start, position + 1 + mark.end, { class: "due-mark" }));
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

type TaskFirstLine = { textBlock: ProseMirrorNode; contentStart: number };

// カーソルのあるチェックリストの項目の、1 行目。カーソルが項目の中に無ければ null。
function taskFirstLineAtCursor(state: EditorState): TaskFirstLine | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "taskItem") {
      const textBlock = node.firstChild;
      // 項目の中身は、項目の開始の 1 つ先から。その先頭が 1 行目で、文字はさらに 1 つ先から。
      return textBlock?.isTextblock ? { textBlock, contentStart: $from.before(depth) + 2 } : null;
    }
  }
  return null;
}

export function isCursorInTaskItem(state: EditorState): boolean {
  return taskFirstLineAtCursor(state) !== null;
}

// カーソルのあるチェックリストの項目の期限。項目の中に無いか、期限が無ければ null。
export function taskDueAtCursor(state: EditorState): string | null {
  const line = taskFirstLineAtCursor(state);
  return line ? findDueMark(lineText(line.textBlock))?.dueAt ?? null : null;
}

// カーソルのある行をチェックリストの項目にして（まだ項目でなければ）、期限の印を付ける。dueAt が null なら外す。
export function setTaskDueAtCursor(editor: Editor, dueAt: string | null): void {
  if (!isCursorInTaskItem(editor.state)) {
    editor.chain().focus().toggleTaskList().run();
  }
  const line = taskFirstLineAtCursor(editor.state);
  if (!line) {
    return;
  }
  const text = lineText(line.textBlock);
  const mark = findDueMark(text);
  const transaction = editor.state.tr;
  if (mark) {
    // 外すときは、印の前の空白も一緒に消す。
    const start = dueAt === null && text[mark.start - 1] === " " ? mark.start - 1 : mark.start;
    transaction.insertText(dueAt === null ? "" : dueMarkText(dueAt), line.contentStart + start, line.contentStart + mark.end);
  } else if (dueAt !== null) {
    const separator = text === "" || text.endsWith(" ") ? "" : " ";
    transaction.insertText(`${separator}${dueMarkText(dueAt)}`, line.contentStart + line.textBlock.content.size);
  }
  editor.view.dispatch(transaction);
  editor.view.focus();
}

export const DueMarks = Extension.create({
  name: "dueMarks",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        state: {
          init: (_config, state) => dueMarkDecorations(state.doc),
          apply: (transaction, decorations) => (transaction.docChanged ? dueMarkDecorations(transaction.doc) : decorations),
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

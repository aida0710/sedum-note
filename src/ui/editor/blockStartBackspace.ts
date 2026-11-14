// 見出し・コードの先頭で押した Backspace は、段落に戻す（引用と箇条書きが段落に戻るのと同じ）。
// エディタの既定では前の段落とつながり、書式が消える（コードは、前の段落の中の改行になる）。
// 本文の先頭の Backspace は、次の順で受ける。
//   1. 書式に変えた直後なら、打った文字に戻す（markdownShortcutUndo.ts）
//   2. 見出し・コードなら、段落に戻す（このファイル）
//   3. 表のすぐ下なら、表の最後のセルへ移る（tableBoundaryKeys.ts）
//   4. ズームしている項目の直下の子なら、何もしない（zoom.ts）
//   5. 子の項目を持つ空の項目なら、子を前の項目へ移して消す（emptyListItemBackspace.ts）
//   6. 本文の最初の段落なら、題へ移る（titleBodyNavigation.ts）
//   7. 既定の動き（前のブロックとつなぐ、箇条書き・引用を外す）

import { type Editor, Extension } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";
import { type EditorState, Selection } from "@tiptap/pm/state";

// 書式に変えた直後の Backspace（markdownShortcutUndo.ts の 1200）の次に見る。
const AFTER_MARKDOWN_SHORTCUT_UNDO = 1150;

const HEADING_TYPE = "heading";
const CODE_BLOCK_TYPE = "codeBlock";

// カーソル（選択なし）が文字のブロックの先頭にあれば、その位置。
function cursorAtTextblockStart(state: EditorState): ResolvedPos | null {
  const { $from, empty } = state.selection;
  return empty && $from.parent.isTextblock && $from.parentOffset === 0 ? $from : null;
}

// コードを、行ごとの段落にする（段落の中に改行の文字を残さない）。
function turnCodeBlockIntoParagraphs(editor: Editor, $cursor: ResolvedPos): boolean {
  const { state } = editor;
  const paragraphType = state.schema.nodes.paragraph;
  if (!paragraphType) {
    return false;
  }
  const paragraphs = $cursor.parent.textContent.split("\n").map((line) => paragraphType.create(null, line === "" ? null : state.schema.text(line)));
  const transaction = state.tr.replaceWith($cursor.before(), $cursor.after(), paragraphs);
  editor.view.dispatch(transaction.setSelection(Selection.near(transaction.doc.resolve($cursor.before() + 1))).scrollIntoView());
  return true;
}

function turnIntoParagraph(editor: Editor, $cursor: ResolvedPos): boolean {
  const blockType = $cursor.parent.type.name;
  if (blockType === HEADING_TYPE) {
    return editor.commands.setParagraph();
  }
  return blockType === CODE_BLOCK_TYPE && turnCodeBlockIntoParagraphs(editor, $cursor);
}

export const BlockStartBackspace = Extension.create({
  name: "blockStartBackspace",
  priority: AFTER_MARKDOWN_SHORTCUT_UNDO,
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const $cursor = cursorAtTextblockStart(editor.state);
        return $cursor !== null && turnIntoParagraph(editor as Editor, $cursor);
      },
    };
  },
});

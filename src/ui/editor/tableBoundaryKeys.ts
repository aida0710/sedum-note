// 表のすぐ外から、表へ向かって消すキー（表のすぐ下の段落の先頭の Backspace、表のすぐ上の段落の末尾の Delete）。
// エディタの既定では、1 回目で表の全部のセルが選ばれ、2 回目で表がまるごと消える。
// ここでは表を消さず、カーソルを表の中（最後のセルの末尾か、最初のセルの先頭）へ移す。空の段落からなら、その行を消してから移す。

import { type Editor, Extension } from "@tiptap/core";
import { Selection, type Transaction } from "@tiptap/pm/state";

// 見出し・コードを段落に戻す Backspace（blockStartBackspace.ts の 1150）の次に見る。
const AFTER_BLOCK_START_BACKSPACE = 1140;

const TABLE_TYPE = "table";

// カーソルのある文字のブロックが空なら消す。
function deleteEmptyBlockAtCursor(editor: Editor, transaction: Transaction): void {
  const { $from } = editor.state.selection;
  if ($from.parent.content.size === 0) {
    transaction.delete($from.before(), $from.after());
  }
}

function moveIntoTableAbove(editor: Editor): boolean {
  const { $from, empty } = editor.state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parentOffset !== 0) {
    return false;
  }
  const blockStart = $from.before();
  if (editor.state.doc.resolve(blockStart).nodeBefore?.type.name !== TABLE_TYPE) {
    return false;
  }
  const transaction = editor.state.tr;
  deleteEmptyBlockAtCursor(editor, transaction);
  // 表の閉じの 1 つ内側から後ろ向きに探すと、最後のセルの末尾に当たる。
  const lastCellEnd = Selection.near(transaction.doc.resolve(blockStart - 1), -1);
  editor.view.dispatch(transaction.setSelection(lastCellEnd).scrollIntoView());
  return true;
}

function moveIntoTableBelow(editor: Editor): boolean {
  const { $from, empty } = editor.state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parentOffset !== $from.parent.content.size) {
    return false;
  }
  const blockEnd = $from.after();
  if (editor.state.doc.resolve(blockEnd).nodeAfter?.type.name !== TABLE_TYPE) {
    return false;
  }
  const transaction = editor.state.tr;
  deleteEmptyBlockAtCursor(editor, transaction);
  // 表の開きの 1 つ内側から前向きに探すと、最初のセルの先頭に当たる。
  const tableStart = transaction.mapping.map(blockEnd);
  const firstCellStart = Selection.near(transaction.doc.resolve(tableStart + 1), 1);
  editor.view.dispatch(transaction.setSelection(firstCellStart).scrollIntoView());
  return true;
}

export const TableBoundaryKeys = Extension.create({
  name: "tableBoundaryKeys",
  priority: AFTER_BLOCK_START_BACKSPACE,
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => moveIntoTableAbove(editor as Editor),
      Delete: ({ editor }) => moveIntoTableBelow(editor as Editor),
    };
  },
});

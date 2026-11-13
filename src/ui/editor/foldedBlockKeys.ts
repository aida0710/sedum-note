// たたんだ項目・見出しのまわりで、打ったものが隠れた所へ入らないようにするキー。
//   Enter（たたんだ項目の題の行）: 隠れた子は元の項目に残し、カーソルから後ろの文字を、その項目のすぐ後ろの新しい項目へ送る。
//          エディタの既定では、隠れた子が新しい項目のほうへ移る。
//   Enter（たたんだ見出し）: 見出しを開いてから、既定のとおり下に段落を作る。見出しのセクションは次の見出しまで続くので、
//          たたんだままでは、新しい段落をどこに作っても隠れる。
//   Enter（どちらも、先頭で押したとき）: たたんだまま、上に空の項目・段落を足す。
//   Tab（たたんだ項目のすぐ下の項目）: 字下げの行き先になる上の項目を開く（開かないと、字下げした項目が隠れる）。

import { type Editor, Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { type EditorState, TextSelection } from "@tiptap/pm/state";
import { FOLDED_ATTRIBUTE } from "../../core/notes/bodyContentChange";

// ズームしている項目の題の行の Enter（zoom.ts の 1100）の次に見る。ID を持つブロックの Enter（blockIds.ts の 1000）や、
// 箇条書きの Enter・Tab（既定の 100）より先。
const AFTER_ZOOM_KEYMAPS = 1050;

const LIST_ITEM_TYPES = ["listItem", "taskItem"];
const HEADING_TYPE = "heading";

// たたんだブロックの文字の中のカーソル。
type CursorInFoldedBlock = {
  // たたんだ項目か見出しと、その位置。
  foldedBlock: ProseMirrorNode;
  foldedPosition: number;
  // カーソルのある文字のブロック（項目なら題の行の段落、見出しなら見出しそのもの）の中の位置。
  $cursor: ResolvedPos;
};

// カーソル（選択なし）が、たたんだ項目の題の行か、たたんだ見出し（本文の直下）の中にあれば、その項目・見出し。
function cursorInFoldedBlock(state: EditorState): CursorInFoldedBlock | null {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock) {
    return null;
  }
  if ($from.depth === 1 && $from.parent.type.name === HEADING_TYPE && $from.parent.attrs[FOLDED_ATTRIBUTE]) {
    return { foldedBlock: $from.parent, foldedPosition: $from.before(), $cursor: $from };
  }
  const item = $from.depth >= 2 ? $from.node(-1) : null;
  const inItemTitle = item !== null && LIST_ITEM_TYPES.includes(item.type.name) && $from.index(-1) === 0;
  return inItemTitle && item.attrs[FOLDED_ATTRIBUTE] ? { foldedBlock: item, foldedPosition: $from.before(-1), $cursor: $from } : null;
}

// たたんだブロックと同じ並びに足す、新しいブロック。項目なら同じ種類の項目（チェックは付けない）、見出しなら段落。
function siblingBlockWith(state: EditorState, foldedBlock: ProseMirrorNode, content: ProseMirrorNode["content"] | null): ProseMirrorNode | null {
  const paragraph = state.schema.nodes.paragraph?.create(null, content);
  if (!paragraph) {
    return null;
  }
  return foldedBlock.type.name === HEADING_TYPE ? paragraph : foldedBlock.type.create(null, paragraph);
}

function splitFoldedBlock(editor: Editor): boolean {
  const { state } = editor;
  const cursor = cursorInFoldedBlock(state);
  if (!cursor || cursor.$cursor.parent.content.size === 0) {
    return false;
  }
  const { $cursor, foldedBlock, foldedPosition } = cursor;
  if ($cursor.parentOffset === 0) {
    const blockAbove = siblingBlockWith(state, foldedBlock, null);
    if (blockAbove) {
      editor.view.dispatch(state.tr.insert(foldedPosition, blockAbove).scrollIntoView());
    }
    return blockAbove !== null;
  }
  if (foldedBlock.type.name === HEADING_TYPE) {
    editor.view.dispatch(state.tr.setNodeAttribute(foldedPosition, FOLDED_ATTRIBUTE, false));
    return false;
  }
  const itemBelow = siblingBlockWith(state, foldedBlock, $cursor.parent.content.cut($cursor.parentOffset));
  if (!itemBelow) {
    return false;
  }
  const insertPosition = foldedPosition + foldedBlock.nodeSize;
  // 後ろから先に変える（先に文字を消すと、足す位置がずれる）。
  const transaction = state.tr.insert(insertPosition, itemBelow).delete($cursor.pos, $cursor.end());
  const cursorInNewItem = transaction.mapping.map(insertPosition, -1) + 1;
  editor.view.dispatch(transaction.setSelection(TextSelection.near(transaction.doc.resolve(cursorInNewItem))).scrollIntoView());
  return true;
}

// カーソルのある項目のすぐ上の項目がたたんであれば、開く。Tab そのもの（字下げ）は、既定の処理に任せる。
function unfoldItemAbove(editor: Editor): boolean {
  const { state } = editor;
  const { $from } = state.selection;
  // コードと表の中の Tab は、項目の字下げにならない。
  if (editor.isActive("codeBlock") || editor.isActive("table")) {
    return false;
  }
  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    if (!LIST_ITEM_TYPES.includes($from.node(depth).type.name)) {
      continue;
    }
    const itemIndex = $from.index(depth - 1);
    const itemAbove = itemIndex > 0 ? $from.node(depth - 1).child(itemIndex - 1) : null;
    if (itemAbove?.attrs[FOLDED_ATTRIBUTE]) {
      editor.view.dispatch(state.tr.setNodeAttribute($from.before(depth) - itemAbove.nodeSize, FOLDED_ATTRIBUTE, false));
    }
    break;
  }
  return false;
}

export const FoldedBlockKeys = Extension.create({
  name: "foldedBlockKeys",
  priority: AFTER_ZOOM_KEYMAPS,
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => splitFoldedBlock(editor as Editor),
      Tab: ({ editor }) => unfoldItemAbove(editor as Editor),
    };
  },
});

// 子の項目を持つ空の箇条書きの項目を、先頭の Backspace で消すとき、子の項目を前の項目の子として残す。
// エディタの既定では、前の項目へつなげるときに子の項目が外の段へ出て、字下げが崩れていた（2 段目の項目が 1 段目になる）。
// 子の無い空の項目と、前の項目の無い（箇条書きの最初の）項目は、既定の動き（1 段浅くする、箇条書きをやめる）のまま。

import { type Editor, Extension } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { type EditorState, TextSelection } from "@tiptap/pm/state";
import { FOLDED_ATTRIBUTE } from "../../core/notes/bodyContentChange";

// ズームしている項目の直下の子の Backspace（zoom.ts の 1100、何もしない）の次に見る。
const AFTER_ZOOM_BACKSPACE = 1090;

const LIST_ITEM_TYPES = new Set(["listItem", "taskItem"]);

// カーソルが、子の項目を持つ空の項目の先頭にあり、その項目の前に同じ箇条書きの項目があれば、その項目の深さ。
function emptyItemWithChildrenDepth(state: EditorState): number | null {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.content.size !== 0) {
    return null;
  }
  const itemDepth = $from.depth - 1;
  if (itemDepth < 1) {
    return null;
  }
  const item = $from.node(itemDepth);
  const hasChildren = item.childCount > 1;
  const isFirstLine = $from.index(itemDepth) === 0;
  const hasPreviousItem = $from.index(itemDepth - 1) > 0;
  return LIST_ITEM_TYPES.has(item.type.name) && hasChildren && isFirstLine && hasPreviousItem ? itemDepth : null;
}

// 前の項目の後ろに、子の箇条書きを足す。前の項目の最後が同じ種類の箇条書きなら、その続きの項目にする。
function withChildrenAppended(previousItem: ProseMirrorNode, children: ProseMirrorNode[]): ProseMirrorNode {
  const lastChild = previousItem.lastChild;
  const [firstList, ...otherLists] = children;
  if (lastChild && firstList && lastChild.type === firstList.type) {
    const mergedList = lastChild.copy(lastChild.content.append(firstList.content));
    return previousItem.copy(previousItem.content.replaceChild(previousItem.childCount - 1, mergedList).append(Fragment.from(otherLists)));
  }
  return previousItem.copy(previousItem.content.append(Fragment.from(children)));
}

// 消したあとのカーソルの置き場所: 前の項目の中で見えている最後の行の末尾（項目の中身の先頭からの位置）。
// 前の項目がたたんであれば、子は隠れているので、その項目の行の末尾にする。
function endOfLastVisibleLine(item: ProseMirrorNode): number {
  const firstLine = item.firstChild;
  if (item.attrs[FOLDED_ATTRIBUTE] === true && firstLine?.isTextblock) {
    return 1 + firstLine.content.size;
  }
  let end = 0;
  item.descendants((node, position) => {
    if (node.isTextblock) {
      end = position + 1 + node.content.size;
    }
  });
  return end;
}

function removeEmptyItemKeepingChildren(editor: Editor): boolean {
  const { state } = editor;
  const itemDepth = emptyItemWithChildrenDepth(state);
  if (itemDepth === null) {
    return false;
  }
  const { $from } = state.selection;
  const item = $from.node(itemDepth);
  const previousItem = $from.node(itemDepth - 1).child($from.index(itemDepth - 1) - 1);
  const previousItemStart = $from.before(itemDepth) - previousItem.nodeSize;
  const children: ProseMirrorNode[] = [];
  item.forEach((child, _offset, index) => {
    if (index > 0) children.push(child);
  });
  const transaction = state.tr.replaceWith(previousItemStart, $from.after(itemDepth), withChildrenAppended(previousItem, children));
  const cursor = previousItemStart + 1 + endOfLastVisibleLine(previousItem);
  editor.view.dispatch(transaction.setSelection(TextSelection.create(transaction.doc, cursor)).scrollIntoView());
  return true;
}

export const EmptyListItemBackspace = Extension.create({
  name: "emptyListItemBackspace",
  priority: AFTER_ZOOM_BACKSPACE,
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => removeEmptyItemKeepingChildren(editor as Editor),
    };
  },
});

// 左の列のメモを本文へドラッグして落としたら、落とした所にそのメモへのリンクを入れる。

import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { NOTE_LINK_NODE } from "../../core/notes/bodyText";
import { readDraggedNote } from "../shared/noteDragData";

// メモのドラッグを落としたなら true（エディタの既定の処理を止める合図）。
export function insertDroppedNoteLink(view: EditorView, event: DragEvent, currentNoteId: string): boolean {
  const dragged = readDraggedNote(event.dataTransfer);
  if (dragged === null) {
    return false;
  }
  event.preventDefault();
  const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
  const linkType = view.state.schema.nodes[NOTE_LINK_NODE];
  // 自分自身へのリンクは入れない。
  if (dragged.noteId === currentNoteId || position === undefined || !linkType) {
    return true;
  }
  const transaction = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position)));
  transaction.replaceSelectionWith(linkType.create({ noteId: dragged.noteId, blockId: null }), false);
  view.dispatch(transaction.scrollIntoView());
  view.focus();
  return true;
}

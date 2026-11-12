// 左の列のメモを本文へドラッグして落としたら、落とした所にそのメモへのリンクを入れる。
// 複数のメモを選んでドラッグしたときは、リンクを空白で区切って並べる。

import { Fragment, type Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { NOTE_LINK_NODE } from "../../core/notes/bodyText";
import { readDraggedNotes } from "../shared/noteDragData";

// メモのドラッグを落としたなら true（エディタの既定の処理を止める合図）。
export function insertDroppedNoteLink(view: EditorView, event: DragEvent, currentNoteId: string): boolean {
  const dragged = readDraggedNotes(event.dataTransfer);
  if (dragged === null) {
    return false;
  }
  event.preventDefault();
  const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
  const linkType = view.state.schema.nodes[NOTE_LINK_NODE];
  // 自分自身へのリンクは入れない。
  const linkedIds = dragged.noteIds.filter((noteId) => noteId !== currentNoteId);
  if (linkedIds.length === 0 || position === undefined || !linkType) {
    return true;
  }
  const links = linkedIds.flatMap((noteId, index): ProseMirrorNode[] => {
    const link = linkType.create({ noteId, blockId: null });
    return index === 0 ? [link] : [view.state.schema.text(" "), link];
  });
  const transaction = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position)));
  transaction.replaceSelection(new Slice(Fragment.fromArray(links), 0, 0));
  view.dispatch(transaction.scrollIntoView());
  view.focus();
  return true;
}

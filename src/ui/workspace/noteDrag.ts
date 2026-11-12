// 左の列で、メモをドラッグして別の一覧（ノートブック・お気に入り・ゴミ箱）へ落とす操作。
// ドラッグしているメモは、ブラウザのドラッグのデータ（dataTransfer）に入れて運ぶ。画面の状態（noteDragState.ts）にも入れ、
// 落とし先を光らせるのに使う。

import type { NoteView } from "../../core/notes/noteQueries";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { showDragPreview } from "../shared/dragPreview";
import { carriesDraggedNote, type DraggedNote, readDraggedNote, writeDraggedNote } from "../shared/noteDragData";
import { beginNoteDragState, type DraggedNoteState, endNoteDragState } from "./noteDragState";
import { viewKey } from "./useWorkspaceNavigation";

type NoteDragInput = { noteId: string; title: string; fromView: NoteView };

export function startNoteDrag(event: React.DragEvent, { noteId, title, fromView }: NoteDragInput): void {
  const dragged: DraggedNote = { noteId, fromNotebookId: fromView.kind === "notebook" ? fromView.notebookId : null };
  writeDraggedNote(event.dataTransfer, dragged);
  showDragPreview(event, title);
  beginNoteDragState({ ...dragged, fromViewKey: viewKey(fromView) });
}

export function isNoteDrag(event: React.DragEvent): boolean {
  return carriesDraggedNote(event.dataTransfer);
}

// メモを落とせる一覧か。タグは本文から決まるので、落としても付けられない。
export function acceptsNoteDrop(view: NoteView): boolean {
  return view.kind !== "tag";
}

// いまドラッグしているメモを、この一覧へ落とせるか。始めた一覧そのものへ落としても何も変わらないので、落とし先にしない。
export function canDropDraggedNote(view: NoteView, dragged: DraggedNoteState | null): boolean {
  return dragged !== null && acceptsNoteDrop(view) && dragged.fromViewKey !== viewKey(view);
}

type NoteDropActions = {
  repository: NoteRepository;
  // ゴミ箱に入れる操作。取り消せる知らせを出すもの（useTrashWithUndo）を呼び出し側が渡す。
  moveToTrash: (noteId: string) => Promise<void>;
};

// 落とした先に合わせてメモを変える。
export async function dropNoteOnView(event: React.DragEvent, view: NoteView, { repository, moveToTrash }: NoteDropActions): Promise<void> {
  const dragged = readDraggedNote(event.dataTransfer);
  endNoteDragState();
  if (dragged === null) {
    return;
  }
  const { noteId, fromNotebookId } = dragged;
  const note = repository.note(noteId);
  if (!note) {
    return;
  }
  const otherNotebookIds = note.content.notebookIds.filter((notebookId) => notebookId !== fromNotebookId);
  switch (view.kind) {
    case "notebook":
      // ノートブックから別のノートブックへは「移す」。ノートブックの外から落としたら「入れる」。
      await repository.updateNote(noteId, { trashedAt: null, notebookIds: [...new Set([...otherNotebookIds, view.notebookId])] });
      break;
    case "all":
      // ノートブックから「すべてのメモ」へ落としたら、そのノートブックから外す。
      await repository.updateNote(noteId, { trashedAt: null, notebookIds: otherNotebookIds });
      break;
    case "bookmarked":
      await repository.updateNote(noteId, { trashedAt: null, bookmarked: true });
      break;
    case "templates":
      await repository.updateNote(noteId, { trashedAt: null, isTemplate: true, pinned: false });
      break;
    case "trash":
      await moveToTrash(noteId);
      break;
    case "tag":
      break;
  }
}

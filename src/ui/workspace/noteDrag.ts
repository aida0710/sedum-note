// 左の列で、メモをドラッグして別の一覧（ノートブック・お気に入り・ゴミ箱）へ落とす操作。
// ドラッグしているメモは、ブラウザのドラッグのデータ（dataTransfer）に入れて運ぶ。

import type { NoteView } from "../../core/notes/noteQueries";
import type { NoteRepository } from "../../core/notes/noteRepository";

// ドラッグのデータの種類。ほかのアプリやファイルのドラッグと区別する。
const NOTE_DRAG_TYPE = "application/x-sedum-note";

type DraggedNote = {
  noteId: string;
  // ドラッグを始めた一覧がノートブックなら、その ID。落とした先へ「移す」のに使う。
  fromNotebookId: string | null;
};

export function startNoteDrag(event: React.DragEvent, noteId: string, fromView: NoteView): void {
  const dragged: DraggedNote = { noteId, fromNotebookId: fromView.kind === "notebook" ? fromView.notebookId : null };
  event.dataTransfer.setData(NOTE_DRAG_TYPE, JSON.stringify(dragged));
  event.dataTransfer.effectAllowed = "move";
}

export function isNoteDrag(event: React.DragEvent): boolean {
  return event.dataTransfer.types.includes(NOTE_DRAG_TYPE);
}

// メモを落とせる一覧か。タグは本文から決まるので、落としても付けられない。
export function acceptsNoteDrop(view: NoteView): boolean {
  return view.kind !== "tag";
}

// 落とした先に合わせてメモを変える。変えたら、そのメモの ID を返す（ゴミ箱に入れたことを知らせるのに使う）。
export async function dropNoteOnView(event: React.DragEvent, view: NoteView, repository: NoteRepository): Promise<string | null> {
  const data = event.dataTransfer.getData(NOTE_DRAG_TYPE);
  if (data === "") {
    return null;
  }
  const { noteId, fromNotebookId } = JSON.parse(data) as DraggedNote;
  const note = repository.note(noteId);
  if (!note) {
    return null;
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
      await repository.moveNoteToTrash(noteId);
      break;
    case "tag":
      return null;
  }
  return noteId;
}

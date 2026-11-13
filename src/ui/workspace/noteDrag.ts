// 左の列で、メモをドラッグして別の一覧（ノートブック・お気に入り・ゴミ箱）へ落とす操作。
// ドラッグしているメモは、ブラウザのドラッグのデータ（dataTransfer）に入れて運ぶ。画面の状態（sidebarDragState.ts）にも入れ、
// 落とし先を光らせるのに使う。選んだメモ（noteSelection.ts）の 1 つをドラッグしたら、選んだメモをまとめて運ぶ。

import type { NoteView } from "../../core/notes/noteQueries";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { showDragPreview } from "../shared/dragPreview";
import { carriesDraggedNotes, type DraggedNotes, readDraggedNotes, writeDraggedNotes } from "../shared/noteDragData";
import { beginSidebarDrag, endSidebarDrag, type SidebarDragState } from "./sidebarDragState";
import { readNoteSelection, resetNoteSelection } from "./noteSelection";
import { viewKey } from "./useWorkspaceNavigation";

type NoteDragInput = {
  noteId: string;
  title: string;
  fromView: NoteView;
};

export function startNoteDrag(event: React.DragEvent, { noteId, title, fromView }: NoteDragInput): void {
  const selectedIds = readNoteSelection().noteIds;
  // 選んでいないメモをドラッグしたら、そのメモだけを運ぶ。
  const noteIds = selectedIds.includes(noteId) ? selectedIds : [noteId];
  const dragged: DraggedNotes = { noteIds, fromNotebookId: fromView.kind === "notebook" ? fromView.notebookId : null };
  writeDraggedNotes(event.dataTransfer, dragged);
  showDragPreview(event, noteIds.length === 1 ? title : translate("sidebar.draggedNotes", { count: noteIds.length }));
  beginSidebarDrag({ kind: "notes", ...dragged, fromViewKey: viewKey(fromView) });
}

export function isNoteDrag(event: React.DragEvent): boolean {
  return carriesDraggedNotes(event.dataTransfer);
}

// メモを落とせる一覧か。タグは本文から決まるので、落としても付けられない。
export function acceptsNoteDrop(view: NoteView): boolean {
  return view.kind !== "tag";
}

// いまドラッグしているメモを、この一覧へ落とせるか。始めた一覧そのものへ落としても何も変わらないので、落とし先にしない。
export function canDropDraggedNote(view: NoteView, dragState: SidebarDragState | null): boolean {
  return dragState?.dragged.kind === "notes" && acceptsNoteDrop(view) && dragState.dragged.fromViewKey !== viewKey(view);
}

// ゴミ箱のほかの一覧。落とすと、メモの項目（ノートブック、お気に入り、テンプレート）が変わる。
export type NoteMoveDestination = Exclude<NoteView, { kind: "trash" }>;

// 落として動かしたメモ。知らせと「元に戻す」に使う。
export type MovedNotes = {
  noteIds: string[];
  destination: NoteMoveDestination;
  // ノートブックの中から落としたか（そのノートブックからは外れる）。
  fromNotebook: boolean;
  // 落とす前の状態に戻す。
  undo: () => Promise<void>;
};

type NoteDropActions = {
  repository: NoteRepository;
  // ゴミ箱に入れる操作。取り消せる知らせを出すもの（useTrashWithUndo）を呼び出し側が渡す。
  moveToTrash: (noteIds: string[]) => Promise<void>;
  // ゴミ箱のほかの一覧へ動かしたあとに呼ぶ。取り消せる知らせを出すもの（useMovedNotesToast）を呼び出し側が渡す。
  onMoved: (moved: MovedNotes) => void;
};

// 落とした先に合わせてメモを変える。落としたあとは、選択を外す（選んだメモは別の一覧へ移っている）。
export async function dropNoteOnView(event: React.DragEvent, view: NoteView, { repository, moveToTrash, onMoved }: NoteDropActions): Promise<void> {
  const dragged = readDraggedNotes(event.dataTransfer);
  endSidebarDrag();
  if (dragged === null) {
    return;
  }
  resetNoteSelection();
  if (view.kind === "trash") {
    await moveToTrash(dragged.noteIds.filter((noteId) => repository.note(noteId)?.content.trashedAt === null));
    return;
  }
  const undoSteps: (() => Promise<void>)[] = [];
  // 移し終えてから 1 回だけ左の列へ知らせる（1 件ごとだと、件数の 2 乗の時間がかかる）。
  await repository.holdChangeNotifications(async () => {
    for (const noteId of dragged.noteIds) {
      const note = repository.note(noteId);
      if (note) {
        const before = movedFieldsOf(note);
        await moveNoteToView(repository, note, { view, fromNotebookId: dragged.fromNotebookId });
        undoSteps.push(() => repository.updateNote(noteId, before));
      }
    }
  });
  if (undoSteps.length === 0) {
    return;
  }
  onMoved({
    noteIds: dragged.noteIds, destination: view, fromNotebook: dragged.fromNotebookId !== null,
    undo: () => repository.holdChangeNotifications(async () => {
      for (const undoStep of undoSteps) {
        await undoStep();
      }
    }),
  });
}

// moveNoteToView が変える項目。「元に戻す」で、落とす前の値に戻す。
function movedFieldsOf({ content }: LiveNote): Pick<LiveNote["content"], "trashedAt" | "notebookIds" | "bookmarked" | "isTemplate" | "pinned"> {
  return { trashedAt: content.trashedAt, notebookIds: content.notebookIds, bookmarked: content.bookmarked, isTemplate: content.isTemplate, pinned: content.pinned };
}

type NoteMove = { view: NoteMoveDestination; fromNotebookId: string | null };

async function moveNoteToView(repository: NoteRepository, note: LiveNote, { view, fromNotebookId }: NoteMove): Promise<void> {
  const noteId = note.id;
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
    case "tag":
      break;
  }
}

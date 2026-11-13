// メモをドラッグして別の一覧へ動かしたあとの知らせ。どこへ動かしたかを伝え、すぐ取り消せるようにする
//（ゴミ箱へ落としたときの useTrashWithUndo と同じ形）。

import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { useToast } from "../shared/ToastProvider";
import type { MovedNotes, NoteMoveDestination } from "./noteDrag";

function destinationNameOf(repository: NoteRepository, destination: NoteMoveDestination): string {
  switch (destination.kind) {
    case "notebook":
      return repository.notebooks().find((notebook) => notebook.id === destination.notebookId)?.content.name ?? "";
    case "tag":
      return `#${destination.tag}`;
    case "all":
      return translate("sidebar.allNotes");
    case "bookmarked":
      return translate("sidebar.bookmarked");
    case "templates":
      return translate("sidebar.templates");
  }
}

// ノートブックからノートブックへ、ノートブックから「すべてのメモ」へは「移動」。ほか（お気に入り、テンプレート、
// ノートブックの外から中へ）は、元の一覧にも残るので「追加」。
function isMoveBetweenLists({ destination, fromNotebook }: MovedNotes): boolean {
  return destination.kind === "all" || (destination.kind === "notebook" && fromNotebook);
}

export function useMovedNotesToast(repository: NoteRepository): (moved: MovedNotes) => void {
  const showToast = useToast();
  return (moved) => {
    const destination = destinationNameOf(repository, moved.destination);
    const [firstNoteId] = moved.noteIds;
    const title = (firstNoteId !== undefined && repository.note(firstNoteId)?.content.title) || translate("sidebar.untitled");
    const isMove = isMoveBetweenLists(moved);
    const message = moved.noteIds.length === 1
      ? translate(isMove ? "toast.movedNote" : "toast.addedNote", { title, destination })
      : translate(isMove ? "toast.movedNotes" : "toast.addedNotes", { count: moved.noteIds.length, destination });
    showToast({ message, action: { label: translate("toast.undo"), run: () => void moved.undo() } });
  };
}

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
    case "unassigned":
      return translate("sidebar.unassigned");
    case "bookmarked":
      return translate("sidebar.bookmarked");
    case "templates":
      return translate("sidebar.templates");
  }
}

// ノートブックと「未指定」へは「移動」（メモは 1 つのノートブックにだけ入る）。ほか（お気に入り、テンプレート、ゴミ箱から
//「すべてのメモ」へ）は、元の一覧にも残るか元の一覧が無いので「追加」。
function isMoveBetweenLists({ destination }: MovedNotes): boolean {
  return destination.kind === "notebook" || destination.kind === "unassigned";
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

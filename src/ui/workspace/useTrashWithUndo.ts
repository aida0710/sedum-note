// メモをゴミ箱に入れ、すぐ取り消せる知らせを出す。まとめて入れたときも、知らせは 1 つにする。

import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { useToast } from "../shared/ToastProvider";

export function useTrashWithUndo(repository: NoteRepository): (noteIds: string[]) => Promise<void> {
  const showToast = useToast();
  return async (noteIds) => {
    if (noteIds.length === 0) {
      return;
    }
    for (const noteId of noteIds) {
      await repository.moveNoteToTrash(noteId);
    }
    showToast({
      message: noteIds.length === 1 ? translate("toast.movedToTrash") : translate("toast.movedManyToTrash", { count: noteIds.length }),
      action: { label: translate("toast.undo"), run: () => void restoreAll(repository, noteIds) },
    });
  };
}

async function restoreAll(repository: NoteRepository, noteIds: string[]): Promise<void> {
  for (const noteId of noteIds) {
    await repository.restoreNoteFromTrash(noteId);
  }
}

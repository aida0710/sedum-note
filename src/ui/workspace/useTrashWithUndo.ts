// メモをゴミ箱に入れ、すぐ取り消せる知らせを出す。

import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { useToast } from "../shared/ToastProvider";

export function useTrashWithUndo(repository: NoteRepository): (noteId: string) => Promise<void> {
  const showToast = useToast();
  return async (noteId) => {
    await repository.moveNoteToTrash(noteId);
    showToast({
      message: translate("toast.movedToTrash"),
      action: { label: translate("toast.undo"), run: () => void repository.restoreNoteFromTrash(noteId) },
    });
  };
}

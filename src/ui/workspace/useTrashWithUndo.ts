// メモをゴミ箱に入れ、すぐ取り消せる知らせを出す。まとめて入れたときも、続けて入れたときも、知らせは 1 つにする。

import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { useToast } from "../shared/ToastProvider";

// 「元に戻す」の知らせが出ている間に、その知らせで戻せるメモ。続けて入れた分をここへ足し、知らせが消えたら空にする。
// 足さずに知らせを置き換えると、前に入れた分の「元に戻す」が消える。
const undoableTrashedNotes = new WeakMap<NoteRepository, string[]>();

export function useTrashWithUndo(repository: NoteRepository): (noteIds: string[]) => Promise<void> {
  const showToast = useToast();
  return async (noteIds) => {
    if (noteIds.length === 0) {
      return;
    }
    for (const noteId of noteIds) {
      await repository.moveNoteToTrash(noteId);
    }
    const undoableNoteIds = [...(undoableTrashedNotes.get(repository) ?? []), ...noteIds];
    showToast({
      message: undoableNoteIds.length === 1 ? translate("toast.movedToTrash") : translate("toast.movedManyToTrash", { count: undoableNoteIds.length }),
      action: { label: translate("toast.undo"), run: () => void restoreAll(repository, undoableNoteIds) },
      onDismiss: () => undoableTrashedNotes.delete(repository),
    });
    // 前の知らせの onDismiss が空にしたあとで、今回の分を入れる。
    undoableTrashedNotes.set(repository, undoableNoteIds);
  };
}

async function restoreAll(repository: NoteRepository, noteIds: string[]): Promise<void> {
  for (const noteId of noteIds) {
    await repository.restoreNoteFromTrash(noteId);
  }
}

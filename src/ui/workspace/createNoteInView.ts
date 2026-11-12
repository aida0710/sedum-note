// 新しいメモを、開いている一覧に合わせて作る（ノートブックの中、お気に入り、テンプレート）。

import type { NoteView } from "../../core/notes/noteQueries";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";

// title を渡すと、その題で作る（コマンドパレットから）。
export async function createNoteInView(repository: NoteRepository, view: NoteView, title = ""): Promise<LiveNote> {
  return repository.createNote({
    title,
    notebookIds: view.kind === "notebook" ? [view.notebookId] : [],
    bookmarked: view.kind === "bookmarked",
    isTemplate: view.kind === "templates",
  });
}

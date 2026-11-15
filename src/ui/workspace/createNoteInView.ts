// 新しいメモを、開いている一覧に合わせて作る（ノートブックの中、お気に入り、テンプレート）。ノートブックの外の一覧
//（すべてのメモ、お気に入りなど）で作ったメモは「未指定」に入る。

import type { NoteView } from "../../core/notes/noteQueries";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";

// title を渡すと、その題で作る（コマンドパレットから）。
export async function createNoteInView(repository: NoteRepository, view: NoteView, title = ""): Promise<LiveNote> {
  return repository.createNote({
    title,
    notebookId: view.kind === "notebook" ? view.notebookId : null,
    bookmarked: view.kind === "bookmarked",
    isTemplate: view.kind === "templates",
  });
}

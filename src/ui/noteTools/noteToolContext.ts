// ツールが共通に使う、リポジトリの上の部品（メモ・ノートブックを ID で引く、メモを結果の形にする、本文を Markdown で読む）。

import type { LiveNote, LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { bodyToMarkdown } from "../markdown/markdownDocument";
import { markdownExportContextOf, markdownImportContextOf } from "../markdown/repositoryMarkdownContext";
import { NoteToolError, type ToolArguments } from "./noteTool";
import { optionalStringList, requiredString } from "./toolArguments";

export function createNoteToolContext(repository: NoteRepository) {
  const noteOf = (toolArguments: ToolArguments): LiveNote => {
    const note = repository.note(requiredString(toolArguments, "noteId"));
    if (!note) {
      throw new NoteToolError("there is no note with that id");
    }
    return note;
  };
  const notebookOf = (toolArguments: ToolArguments, name = "notebookId"): LiveNotebook => {
    const notebook = repository.notebooks().find((candidate) => candidate.id === requiredString(toolArguments, name));
    if (!notebook) {
      throw new NoteToolError("there is no notebook with that id");
    }
    return notebook;
  };
  // 引数のノートブックの ID の一覧。無い ID があれば NoteToolError。
  const existingNotebookIds = (toolArguments: ToolArguments): string[] | undefined => {
    const notebookIds = optionalStringList(toolArguments, "notebookIds");
    const known = new Set(repository.notebooks().map((notebook) => notebook.id));
    const unknown = notebookIds?.find((notebookId) => !known.has(notebookId));
    if (unknown !== undefined) {
      throw new NoteToolError(`there is no notebook with the id ${unknown}`);
    }
    return notebookIds;
  };
  const notebookName = (notebookId: string): string => repository.notebooks().find((notebook) => notebook.id === notebookId)?.content.name ?? notebookId;
  const describeNote = (note: LiveNote) => ({
    noteId: note.id,
    title: note.content.title,
    notebookIds: note.content.notebookIds,
    pinned: note.content.pinned,
    bookmarked: note.content.bookmarked,
    inTrash: note.content.trashedAt !== null,
    isTemplate: note.content.isTemplate,
    createdAt: note.content.createdAt,
    updatedAt: note.updatedAt,
  });
  // 変えたあとのメモ（無ければ変える前のもの）を、結果の形にする。
  const describeNoteAfterChange = (note: LiveNote) => describeNote(repository.note(note.id) ?? note);
  return {
    repository,
    noteOf,
    notebookOf,
    existingNotebookIds,
    notebookName,
    describeNote,
    describeNoteAfterChange,
    markdownOf: (note: LiveNote) => bodyToMarkdown(note.body, markdownExportContextOf(repository)),
    importContext: markdownImportContextOf(repository),
  };
}

export type NoteToolContext = ReturnType<typeof createNoteToolContext>;

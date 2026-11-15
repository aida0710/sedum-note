// ツールが共通に使う、リポジトリの上の部品（メモ・ノートブックを ID で引く、メモを結果の形にする、本文と Markdown の読み書きの文脈）。

import type { LiveNote, LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { bodyToMarkdown } from "../markdown/markdownDocument";
import { markdownExportContextOf, markdownImportContextOf } from "../markdown/repositoryMarkdownContext";
import { NoteToolError, type ToolArguments } from "./noteTool";
import { translate } from "../i18n/translate";
import { optionalString, requiredString } from "./toolArguments";

export function createNoteToolContext(repository: NoteRepository) {
  const exportContext = markdownExportContextOf(repository);
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
  // 引数の、メモを入れるノートブック（notebookId）。null は「未指定」（どのノートブックにも入れない）、渡されていなければ undefined。
  // 無い ID なら NoteToolError。
  const notebookIdArgument = (toolArguments: ToolArguments): string | null | undefined => {
    if (toolArguments.notebookId === null) {
      return null;
    }
    const notebookId = optionalString(toolArguments, "notebookId");
    if (notebookId !== undefined && !repository.notebooks().some((notebook) => notebook.id === notebookId)) {
      throw new NoteToolError(`there is no notebook with the id ${notebookId}`);
    }
    return notebookId;
  };
  // 承認のカードに出す、ノートブックの名前。null は「未指定」。
  const notebookName = (notebookId: string | null): string => notebookId === null
    ? translate("sidebar.unassigned")
    : repository.notebooks().find((notebook) => notebook.id === notebookId)?.content.name ?? notebookId;
  const describeNote = (note: LiveNote) => ({
    noteId: note.id,
    title: note.content.title,
    notebookId: note.content.notebookId,
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
    notebookIdArgument,
    notebookName,
    describeNote,
    describeNoteAfterChange,
    markdownOf: (note: LiveNote) => bodyToMarkdown(note.body, exportContext),
    exportContext,
    importContext: markdownImportContextOf(repository),
  };
}

export type NoteToolContext = ReturnType<typeof createNoteToolContext>;

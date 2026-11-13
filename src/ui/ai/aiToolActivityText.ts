// ツールの呼び出しを、会話の中の 1 行と承認のカードに出す文にする。

import { translate } from "../i18n/translate";
import type { NoteToolPreview } from "../noteTools/noteTool";
import type { AiToolActivity, AiToolActivityStatus } from "./aiToolCalls";

const titleText = (title: string): string => title || translate("sidebar.untitled");

const UPDATED_FIELD_KEYS = {
  title: "ai.tool.field.title",
  notebooks: "ai.tool.field.notebooks",
  pinned: "ai.tool.field.pinned",
  bookmarked: "ai.tool.field.bookmarked",
} as const;

export function updatedFieldText(field: keyof typeof UPDATED_FIELD_KEYS): string {
  return translate(UPDATED_FIELD_KEYS[field]);
}

function searchDescription(preview: Extract<NoteToolPreview, { kind: "searchNotes" }>): string {
  if (preview.inTrash) {
    return translate("ai.tool.searchTrash");
  }
  if (preview.query !== null) {
    return translate("ai.tool.searchQuery", { query: preview.query });
  }
  if (preview.notebookName !== null) {
    return translate("ai.tool.searchNotebook", { name: preview.notebookName });
  }
  return preview.tag !== null ? translate("ai.tool.searchTag", { tag: preview.tag }) : translate("ai.tool.searchAll");
}

// 何をする呼び出しか。準備できなかった呼び出し（preview が無い）は、ツールの名前で書く。
export function toolCallDescription(preview: NoteToolPreview | null, toolName: string): string {
  if (preview === null) {
    return translate("ai.tool.unprepared", { name: toolName });
  }
  switch (preview.kind) {
    case "searchNotes":
      return searchDescription(preview);
    case "readNote":
      return translate("ai.tool.readNote", { title: titleText(preview.title) });
    case "listNotebooks":
      return translate("ai.tool.listNotebooks");
    case "listTags":
      return translate("ai.tool.listTags");
    case "createNote":
      return translate("ai.tool.createNote", { title: titleText(preview.title) });
    case "updateNote":
      return translate("ai.tool.updateNote", { title: titleText(preview.title), fields: preview.changes.map((change) => updatedFieldText(change.field)).join(translate("ai.tool.fieldSeparator")) });
    case "appendToNote":
      return translate("ai.tool.appendToNote", { title: titleText(preview.title), count: preview.characterCount });
    case "replaceNoteBody":
      return translate("ai.tool.replaceNoteBody", { title: titleText(preview.title) });
    case "moveNoteToTrash":
      return translate("ai.tool.moveNoteToTrash", { title: titleText(preview.title) });
    case "restoreNoteFromTrash":
      return translate("ai.tool.restoreNoteFromTrash", { title: titleText(preview.title) });
    case "deleteNotePermanently":
      return translate("ai.tool.deleteNotePermanently", { title: titleText(preview.title) });
    case "createNotebook":
      return translate("ai.tool.createNotebook", { name: preview.name });
    case "renameNotebook":
      return translate("ai.tool.renameNotebook", { before: preview.before, after: preview.after });
    case "deleteNotebook":
      return translate("ai.tool.deleteNotebook", { name: preview.name });
  }
}

// 様子の文。済んだときは、件数があれば件数を出す。
export function activityStatusText(activity: AiToolActivity): string | null {
  const status: AiToolActivityStatus = activity.status;
  if (status === "done") {
    return activity.resultSummary?.count === undefined ? null : translate("ai.tool.count", { count: activity.resultSummary.count });
  }
  return translate(`ai.tool.status.${status}`);
}

// 行を押したときに開くメモ（作った・読んだ・直したメモ）。無ければ null。
export function activityNoteId(activity: AiToolActivity): string | null {
  if (activity.resultSummary?.noteId !== undefined) {
    return activity.resultSummary.noteId;
  }
  return activity.preview !== null && "noteId" in activity.preview ? activity.preview.noteId : null;
}

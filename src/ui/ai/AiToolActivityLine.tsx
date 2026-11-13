// AI の答えの中の、ツールの呼び出しの 1 行（「『沖縄』で検索（12 件）」「『旅行の計画』を読む」）。
// 対象のメモがあれば、押すとそのメモを開く。

import { FilePlus, FileText, FolderPen, FolderPlus, FolderX, List, type LucideIcon, PencilLine, RotateCcw, Search, Trash2, Wrench } from "lucide-react";
import type { NoteToolPreview } from "../noteTools/noteTool";
import type { AiToolActivity } from "./aiToolCalls";
import { activityNoteId, activityStatusText, toolCallDescription } from "./aiToolActivityText";

const ACTIVITY_ICON_SIZE = 13;

const ICONS: Record<NoteToolPreview["kind"], LucideIcon> = {
  searchNotes: Search,
  readNote: FileText,
  listNotebooks: List,
  listTags: List,
  createNote: FilePlus,
  updateNote: PencilLine,
  appendToNote: PencilLine,
  replaceNoteBody: PencilLine,
  moveNoteToTrash: Trash2,
  restoreNoteFromTrash: RotateCcw,
  deleteNotePermanently: Trash2,
  createNotebook: FolderPlus,
  renameNotebook: FolderPen,
  deleteNotebook: FolderX,
};

type AiToolActivityLineProps = {
  activity: AiToolActivity;
  // メモがまだあるか（消えたメモの行は押せなくする）。
  noteExists: (noteId: string) => boolean;
  onOpenNote: (noteId: string) => void;
};

export function AiToolActivityLine({ activity, noteExists, onOpenNote }: AiToolActivityLineProps) {
  const Icon = activity.preview ? ICONS[activity.preview.kind] : Wrench;
  const status = activityStatusText(activity);
  const noteId = activityNoteId(activity);
  const content = (
    <>
      <Icon size={ACTIVITY_ICON_SIZE} />
      <span className="ai-tool-description">{toolCallDescription(activity.preview, activity.toolName)}</span>
      {status && <span className="ai-tool-status">{status}</span>}
    </>
  );
  if (noteId !== null && noteExists(noteId)) {
    return <button type="button" className="ai-tool-activity" data-status={activity.status} onClick={() => onOpenNote(noteId)}>{content}</button>;
  }
  return <div className="ai-tool-activity" data-status={activity.status}>{content}</div>;
}

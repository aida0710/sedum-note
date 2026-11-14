// ピン留めしたタブに、題の代わりに出すアイコン（ピン留めのタブは、アイコンだけの小さなタブにする）。
// メモは、そのメモのノートブックの色のメモのアイコン。メモ以外のタブ（設定・グラフ・期限の一覧・データベース表示）は、それぞれのアイコン。

import { AlarmClock, FileText, type LucideIcon, Settings, Table, Waypoints } from "lucide-react";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { assignNotebookColors } from "../shared/notebookAppearance";
import { GRAPH_TAB, notebookIdOfDatabaseTab, REMINDERS_TAB, SETTINGS_TAB } from "./useWorkspaceNavigation";

const PINNED_TAB_ICON_SIZE = 16;

function iconOfTab(tabId: string): LucideIcon {
  if (tabId === SETTINGS_TAB) {
    return Settings;
  }
  if (tabId === GRAPH_TAB) {
    return Waypoints;
  }
  if (tabId === REMINDERS_TAB) {
    return AlarmClock;
  }
  return notebookIdOfDatabaseTab(tabId) !== null ? Table : FileText;
}

export function PinnedTabIcon({ tabId, repository }: { tabId: string; repository: NoteRepository }) {
  const Icon = iconOfTab(tabId);
  // どのノートブックにも入っていないメモと、メモ以外のタブは、タブの文字の色のまま。
  const notebookId = repository.note(tabId)?.content.notebookIds[0];
  const color = notebookId === undefined ? undefined : assignNotebookColors(repository.notebooks()).colorOf(notebookId);
  return (
    <span className="tab-pinned-icon" style={color === undefined ? undefined : { color }}>
      <Icon size={PINNED_TAB_ICON_SIZE} />
    </span>
  );
}

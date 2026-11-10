// どの一覧を開いているか、どのメモをタブで開いているか。

import { useCallback, useState } from "react";
import type { NoteView } from "../../core/notes/noteQueries";

// 設定はメモと同じくタブで開く。メモの ID（16 進）と重ならない名前にする。
export const SETTINGS_TAB = "settings";

export type WorkspaceNavigation = {
  view: NoteView;
  selectView: (view: NoteView) => void;
  openTabs: string[];
  activeTab: string | null;
  openNote: (noteId: string) => void;
  openSettings: () => void;
  closeTab: (tabId: string) => void;
  expandedIds: ReadonlySet<string>;
  toggleExpanded: (id: string) => void;
  searchText: string;
  setSearchText: (text: string) => void;
};

export function viewKey(view: NoteView): string {
  switch (view.kind) {
    case "notebook":
      return `notebook:${view.notebookId}`;
    case "tag":
      return `tag:${view.tag}`;
    default:
      return view.kind;
  }
}

export function useWorkspaceNavigation(): WorkspaceNavigation {
  const [view, setView] = useState<NoteView>({ kind: "all" });
  const [tabs, setTabs] = useState<{ openTabs: string[]; activeTab: string | null }>({ openTabs: [], activeTab: null });
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set(["all"]));
  const [searchText, setSearchText] = useState("");

  const openTab = useCallback((tabId: string) => {
    setTabs(({ openTabs }) => ({ openTabs: openTabs.includes(tabId) ? openTabs : [...openTabs, tabId], activeTab: tabId }));
  }, []);

  // 開いているタブを閉じたら、その右（無ければ左）のタブを開く。
  const closeTab = useCallback((tabId: string) => {
    setTabs(({ openTabs, activeTab }) => {
      const index = openTabs.indexOf(tabId);
      const remaining = openTabs.filter((id) => id !== tabId);
      const nextActive = activeTab === tabId ? remaining[Math.min(index, remaining.length - 1)] ?? null : activeTab;
      return { openTabs: remaining, activeTab: nextActive };
    });
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectView = useCallback((next: NoteView) => {
    setView(next);
    setExpandedIds((current) => new Set(current).add(viewKey(next)));
  }, []);

  return {
    view, selectView, openTabs: tabs.openTabs, activeTab: tabs.activeTab, openNote: openTab, openSettings: () => openTab(SETTINGS_TAB), closeTab,
    expandedIds, toggleExpanded, searchText, setSearchText,
  };
}

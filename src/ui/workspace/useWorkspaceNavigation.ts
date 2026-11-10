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
  // 左の列の行が開いているか。expandedByDefault は、利用者がまだ開け閉めしていないときの状態
  //（案C の試作どおり、ノートブックは開き、ほかは閉じる）。
  isExpanded: (key: string, expandedByDefault: boolean) => boolean;
  setExpanded: (key: string, expanded: boolean) => void;
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
  // 利用者が開け閉めした行だけを持つ。持っていない行は既定の状態。
  const [expandedOverrides, setExpandedOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());
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

  const setExpanded = useCallback((key: string, expanded: boolean) => {
    setExpandedOverrides((current) => new Map(current).set(key, expanded));
  }, []);

  const isExpanded = useCallback(
    (key: string, expandedByDefault: boolean) => expandedOverrides.get(key) ?? expandedByDefault,
    [expandedOverrides],
  );

  const selectView = useCallback((next: NoteView) => {
    setView(next);
    setExpanded(viewKey(next), true);
  }, [setExpanded]);

  return {
    view, selectView, openTabs: tabs.openTabs, activeTab: tabs.activeTab, openNote: openTab, openSettings: () => openTab(SETTINGS_TAB), closeTab,
    isExpanded, setExpanded, searchText, setSearchText,
  };
}

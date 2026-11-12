// どの一覧を開いているか、どのメモをタブで開いているか。

import { useCallback, useState } from "react";
import type { NoteView } from "../../core/notes/noteQueries";
import type { BlockToReveal } from "../editor/noteLinkTargets";

// 設定はメモと同じくタブで開く。メモの ID（16 進）と重ならない名前にする。
export const SETTINGS_TAB = "settings";
// グラフ表示もタブで開く。
export const GRAPH_TAB = "graph";

// ノートブックのデータベース表示もタブで開く。タブの ID は、この先頭にノートブックの ID を続ける。
const DATABASE_TAB_PREFIX = "database:";

export function databaseTabId(notebookId: string): string {
  return DATABASE_TAB_PREFIX + notebookId;
}

// タブがデータベース表示なら、そのノートブックの ID。違えば null。
export function notebookIdOfDatabaseTab(tabId: string | null): string | null {
  return tabId?.startsWith(DATABASE_TAB_PREFIX) ? tabId.slice(DATABASE_TAB_PREFIX.length) : null;
}

export type WorkspaceNavigation = {
  view: NoteView;
  selectView: (view: NoteView) => void;
  openTabs: string[];
  activeTab: string | null;
  // blockId を渡すと、メモを開いたあと、そのブロックまで送る（ブロックを指すリンクから開いたとき）。
  openNote: (noteId: string, blockId?: string) => void;
  // リンクから来て、開いたメモの中で見せるブロック。ほかのタブへ移ると消える。
  blockToReveal: BlockToReveal | null;
  // メモ以外のタブ（データベース表示）を開く。
  openTab: (tabId: string) => void;
  openSettings: () => void;
  closeTab: (tabId: string) => void;
  // タブを、別のタブの位置へ動かす（ドラッグでの並べ替え）。
  moveTab: (tabId: string, toTabId: string) => void;
  // 左の列の行が開いているか。expandedByDefault は、利用者がまだ開け閉めしていないときの状態
  //（案C の試作どおり、ノートブックは開き、ほかは閉じる）。
  isExpanded: (key: string, expandedByDefault: boolean) => boolean;
  setExpanded: (key: string, expanded: boolean) => void;
  searchText: string;
  setSearchText: (text: string) => void;
  // ショートカットからの合図。押すたびに数が増え、受け取る側が欄を開いてカーソルを置く。
  searchFocusRequest: number;
  requestSearchFocus: () => void;
  findInNoteRequest: number;
  requestFindInNote: () => void;
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
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const [findInNoteRequest, setFindInNoteRequest] = useState(0);

  const [blockToReveal, setBlockToReveal] = useState<BlockToReveal | null>(null);

  const openTab = useCallback((tabId: string) => {
    setTabs(({ openTabs }) => ({ openTabs: openTabs.includes(tabId) ? openTabs : [...openTabs, tabId], activeTab: tabId }));
    setBlockToReveal(null);
  }, []);

  const openNote = useCallback((noteId: string, blockId?: string) => {
    openTab(noteId);
    // 一覧の行などは、押したときの出来事を 2 つ目の引数に渡してくることがあるので、文字のときだけブロックの指定として読む。
    setBlockToReveal(typeof blockId === "string" ? { noteId, blockId } : null);
  }, [openTab]);

  // 開いているタブを閉じたら、その右（無ければ左）のタブを開く。
  const closeTab = useCallback((tabId: string) => {
    setTabs(({ openTabs, activeTab }) => {
      const index = openTabs.indexOf(tabId);
      const remaining = openTabs.filter((id) => id !== tabId);
      const nextActive = activeTab === tabId ? remaining[Math.min(index, remaining.length - 1)] ?? null : activeTab;
      return { openTabs: remaining, activeTab: nextActive };
    });
    setBlockToReveal(null);
  }, []);

  const moveTab = useCallback((tabId: string, toTabId: string) => {
    setTabs(({ openTabs, activeTab }) => {
      const from = openTabs.indexOf(tabId);
      const to = openTabs.indexOf(toTabId);
      if (from === -1 || to === -1 || from === to) {
        return { openTabs, activeTab };
      }
      const reordered = openTabs.filter((id) => id !== tabId);
      reordered.splice(to, 0, tabId);
      return { openTabs: reordered, activeTab };
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
    view, selectView, openTabs: tabs.openTabs, activeTab: tabs.activeTab, openNote, blockToReveal, openTab, openSettings: () => openTab(SETTINGS_TAB), closeTab, moveTab,
    isExpanded, setExpanded, searchText, setSearchText,
    searchFocusRequest, requestSearchFocus: () => setSearchFocusRequest((count) => count + 1),
    findInNoteRequest, requestFindInNote: () => setFindInNoteRequest((count) => count + 1),
  };
}

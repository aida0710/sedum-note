// どの一覧を開いているか、どのメモをタブで開いているか。

import { useCallback, useState } from "react";
import type { NoteView } from "../../core/notes/noteQueries";
import type { FindRequest } from "../editor/FindBar";
import type { BlockToReveal } from "../editor/noteLinkTargets";
import { SETTINGS_PAGES, type SettingsPage } from "../settings/settingsPages";
import type { SettingRevealRequest } from "../settings/revealSetting";
import type { WorkspaceLayout } from "../../core/vault/workspaceLayout";
import { closeTabsIn, moveTabIn, NO_TABS, openTabIn, otherTabsThan, reopenClosedTabIn, restoreTabsIn, type TabsState, tabsRightOf, togglePinnedTabIn } from "./tabState";

// 設定はメモと同じくタブで開く。メモの ID（16 進）と重ならない名前にする。
export const SETTINGS_TAB = "settings";
// グラフ表示もタブで開く。
export const GRAPH_TAB = "graph";
// 期限の一覧のタブ。
export const REMINDERS_TAB = "reminders";

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
  // 設定のタブを開く。ページを渡すとそのページを出し、渡さなければ前に見ていたページのままにする。
  openSettings: (page?: SettingsPage) => void;
  // 設定で開いているページ。null はまだ選んでいない（スマホではページの一覧を出す）。
  settingsPage: SettingsPage | null;
  selectSettingsPage: (page: SettingsPage | null) => void;
  // 設定のページを開き、名前が label の項目（見出しか入力欄）まで送る（コマンドパレットから）。
  revealSetting: (page: SettingsPage, label: string) => void;
  settingRevealRequest: SettingRevealRequest | null;
  closeTab: (tabId: string) => void;
  // タブの右クリックのメニュー。ピン留めしたタブは、ほか・右を閉じるときに閉じない。
  closeOtherTabs: (tabId: string) => void;
  closeTabsToRight: (tabId: string) => void;
  // 画面分割の右側に開いているメモ。分割していなければ null。
  splitNoteId: string | null;
  openInSplit: (noteId: string) => void;
  closeSplit: () => void;
  pinnedTabs: string[];
  togglePinnedTab: (tabId: string) => void;
  // いちばん最近に閉じたタブを開き直す。閉じたタブが無ければ false。
  reopenClosedTab: () => boolean;
  // タブを、別のタブの位置へ動かす（ドラッグでの並べ替え）。
  moveTab: (tabId: string, toTabId: string) => void;
  // 左の列の行が開いているか。expandedByDefault は、利用者がまだ開け閉めしていないときの状態
  //（案C の試作どおり、ノートブックは開き、ほかは閉じる）。
  isExpanded: (key: string, expandedByDefault: boolean) => boolean;
  setExpanded: (key: string, expanded: boolean) => void;
  // 利用者が開け閉めした行（行のキー → 開いているか）。手元に残す並びに入れる（useRememberedWorkspaceLayout.ts）。
  expandedRows: ReadonlyMap<string, boolean>;
  // 手元に残した並び（タブと、開け閉めした行）を戻す。tabExists が false を返すタブは捨てる。
  restoreLayout: (layout: WorkspaceLayout, tabExists: (tabId: string) => boolean) => void;
  searchText: string;
  setSearchText: (text: string) => void;
  // ショートカットからの合図。押すたびに数が増え、受け取る側が欄を開いてカーソルを置く。
  searchFocusRequest: number;
  requestSearchFocus: () => void;
  findInNoteRequest: FindRequest;
  // showReplace なら、置換の欄も出す（Ctrl+R）。
  requestFindInNote: (showReplace?: boolean) => void;
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

// initialNoteId を渡すと、そのメモを開いた状態から始める（メモを 1 つだけ開く、別のウィンドウ）。
export function useWorkspaceNavigation(initialNoteId: string | null = null): WorkspaceNavigation {
  const [view, setView] = useState<NoteView>({ kind: "all" });
  const [tabs, setTabs] = useState<TabsState>(() => (initialNoteId === null ? NO_TABS : openTabIn(NO_TABS, initialNoteId)));
  // 利用者が開け閉めした行だけを持つ。持っていない行は既定の状態。
  const [expandedRows, setExpandedRows] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [searchText, setSearchText] = useState("");
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const [findInNoteRequest, setFindInNoteRequest] = useState<FindRequest>({ serial: 0, showReplace: false });
  const [settingsPage, setSettingsPage] = useState<SettingsPage | null>(null);
  const [settingRevealRequest, setSettingRevealRequest] = useState<SettingRevealRequest | null>(null);

  const [blockToReveal, setBlockToReveal] = useState<BlockToReveal | null>(null);

  const openTab = useCallback((tabId: string) => {
    setTabs((current) => openTabIn(current, tabId));
    setBlockToReveal(null);
  }, []);

  const openNote = useCallback((noteId: string, blockId?: string) => {
    openTab(noteId);
    // 一覧の行などは、押したときの出来事を 2 つ目の引数に渡してくることがあるので、文字のときだけブロックの指定として読む。
    setBlockToReveal(typeof blockId === "string" ? { noteId, blockId } : null);
  }, [openTab]);

  // 開いているタブを閉じたら、その右（無ければ左）のタブを開く（tabState.ts）。
  const closeTabs = useCallback((tabIds: string[]) => {
    setTabs((current) => closeTabsIn(current, tabIds));
    setBlockToReveal(null);
  }, []);
  const closeTab = useCallback((tabId: string) => closeTabs([tabId]), [closeTabs]);
  const [splitNoteId, setSplitNoteId] = useState<string | null>(null);
  const closeSplit = useCallback(() => setSplitNoteId(null), []);

  const moveTab = useCallback((tabId: string, toTabId: string) => {
    setTabs((current) => moveTabIn(current, tabId, toTabId));
  }, []);

  const setExpanded = useCallback((key: string, expanded: boolean) => {
    setExpandedRows((current) => new Map(current).set(key, expanded));
  }, []);

  const isExpanded = useCallback(
    (key: string, expandedByDefault: boolean) => expandedRows.get(key) ?? expandedByDefault,
    [expandedRows],
  );

  // 戻すまでの間に利用者が開け閉めした行は、そちらを残す。
  const restoreLayout = useCallback<WorkspaceNavigation["restoreLayout"]>((layout, tabExists) => {
    setTabs((current) => restoreTabsIn(current, layout, tabExists));
    // 戻すまでの間に設定のページを選んでいたら、そちらを残す。知らない名前のページ（前のバージョンのもの）は捨てる。
    const rememberedPage = SETTINGS_PAGES.find((page) => page === layout.settingsPage) ?? null;
    setSettingsPage((current) => current ?? rememberedPage);
    setExpandedRows((current) => new Map([...Object.entries(layout.expandedRows), ...current]));
  }, []);

  const openSettings = useCallback((page?: SettingsPage) => {
    // ボタンの onClick にそのまま渡されると、押したときの出来事が来るので、ページの名前のときだけ読む。
    if (page !== undefined && SETTINGS_PAGES.includes(page)) {
      setSettingsPage(page);
    }
    openTab(SETTINGS_TAB);
  }, [openTab]);

  const selectView = useCallback((next: NoteView) => {
    setView(next);
    setExpanded(viewKey(next), true);
  }, [setExpanded]);

  return {
    view, selectView, openTabs: tabs.openTabs, activeTab: tabs.activeTab, openNote, blockToReveal, openTab, openSettings, closeTab, moveTab,
    closeOtherTabs: (tabId) => closeTabs(otherTabsThan(tabs, tabId)),
    closeTabsToRight: (tabId) => closeTabs(tabsRightOf(tabs, tabId)),
    splitNoteId, openInSplit: setSplitNoteId, closeSplit,
    pinnedTabs: tabs.pinnedTabs,
    togglePinnedTab: (tabId) => setTabs((current) => togglePinnedTabIn(current, tabId)),
    reopenClosedTab: () => {
      if (tabs.closedTabs.length === 0) {
        return false;
      }
      setTabs(reopenClosedTabIn);
      return true;
    },
    settingsPage, selectSettingsPage: setSettingsPage, settingRevealRequest,
    revealSetting: (page, label) => {
      setSettingRevealRequest((previous) => ({ serial: (previous?.serial ?? 0) + 1, label }));
      openSettings(page);
    },
    isExpanded, setExpanded, expandedRows, restoreLayout, searchText, setSearchText,
    searchFocusRequest, requestSearchFocus: () => setSearchFocusRequest((count) => count + 1),
    findInNoteRequest,
    requestFindInNote: (showReplace = false) => setFindInNoteRequest(({ serial }) => ({ serial: serial + 1, showReplace: showReplace === true })),
  };
}

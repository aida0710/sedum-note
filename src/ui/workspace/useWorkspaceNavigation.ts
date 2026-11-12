// どの一覧を開いているか、どのメモをタブで開いているか。

import { useCallback, useState } from "react";
import type { NoteView } from "../../core/notes/noteQueries";
import type { FindRequest } from "../editor/FindBar";
import type { BlockToReveal } from "../editor/noteLinkTargets";
import { SETTINGS_PAGES, type SettingsPage } from "../settings/settingsPages";
import type { SettingRevealRequest } from "../settings/revealSetting";
import { closeTabsIn, moveTabIn, NO_TABS, openTabIn, otherTabsThan, reopenClosedTabIn, type TabsState, tabsRightOf, togglePinnedTabIn } from "./tabState";

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
  // ロックしたメモのうち、パスフレーズを確かめて中身を出しているもの。タブを閉じると、また確認が要る。
  revealedNoteIds: ReadonlySet<string>;
  revealLockedNote: (noteId: string) => void;
  // タブの右クリックのメニュー。ピン留めしたタブは、ほか・右を閉じるときに閉じない。
  closeOtherTabs: (tabId: string) => void;
  closeTabsToRight: (tabId: string) => void;
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

export function useWorkspaceNavigation(): WorkspaceNavigation {
  const [view, setView] = useState<NoteView>({ kind: "all" });
  const [tabs, setTabs] = useState<TabsState>(NO_TABS);
  // 利用者が開け閉めした行だけを持つ。持っていない行は既定の状態。
  const [expandedOverrides, setExpandedOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [searchText, setSearchText] = useState("");
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const [findInNoteRequest, setFindInNoteRequest] = useState<FindRequest>({ serial: 0, showReplace: false });
  const [settingsPage, setSettingsPage] = useState<SettingsPage | null>(null);
  const [settingRevealRequest, setSettingRevealRequest] = useState<SettingRevealRequest | null>(null);

  const [blockToReveal, setBlockToReveal] = useState<BlockToReveal | null>(null);
  const [revealedNoteIds, setRevealedNoteIds] = useState<ReadonlySet<string>>(new Set());
  const revealLockedNote = useCallback((noteId: string) => setRevealedNoteIds((current) => new Set(current).add(noteId)), []);

  const openTab = useCallback((tabId: string) => {
    setTabs((current) => openTabIn(current, tabId));
    setBlockToReveal(null);
  }, []);

  const openNote = useCallback((noteId: string, blockId?: string) => {
    openTab(noteId);
    // 一覧の行などは、押したときの出来事を 2 つ目の引数に渡してくることがあるので、文字のときだけブロックの指定として読む。
    setBlockToReveal(typeof blockId === "string" ? { noteId, blockId } : null);
  }, [openTab]);

  // 開いているタブを閉じたら、その右（無ければ左）のタブを開く（tabState.ts）。閉じたロックのメモは、また確認が要る。
  const closeTabs = useCallback((tabIds: string[]) => {
    setTabs((current) => closeTabsIn(current, tabIds));
    setRevealedNoteIds((current) => new Set([...current].filter((noteId) => !tabIds.includes(noteId))));
    setBlockToReveal(null);
  }, []);
  const closeTab = useCallback((tabId: string) => closeTabs([tabId]), [closeTabs]);

  const moveTab = useCallback((tabId: string, toTabId: string) => {
    setTabs((current) => moveTabIn(current, tabId, toTabId));
  }, []);

  const setExpanded = useCallback((key: string, expanded: boolean) => {
    setExpandedOverrides((current) => new Map(current).set(key, expanded));
  }, []);

  const isExpanded = useCallback(
    (key: string, expandedByDefault: boolean) => expandedOverrides.get(key) ?? expandedByDefault,
    [expandedOverrides],
  );

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
    view, selectView, openTabs: tabs.openTabs, activeTab: tabs.activeTab, openNote, blockToReveal, openTab, openSettings, closeTab, moveTab, revealedNoteIds, revealLockedNote,
    closeOtherTabs: (tabId) => closeTabs(otherTabsThan(tabs, tabId)),
    closeTabsToRight: (tabId) => closeTabs(tabsRightOf(tabs, tabId)),
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
    isExpanded, setExpanded, searchText, setSearchText,
    searchFocusRequest, requestSearchFocus: () => setSearchFocusRequest((count) => count + 1),
    findInNoteRequest,
    requestFindInNote: (showReplace = false) => setFindInNoteRequest(({ serial }) => ({ serial: serial + 1, showReplace: showReplace === true })),
  };
}

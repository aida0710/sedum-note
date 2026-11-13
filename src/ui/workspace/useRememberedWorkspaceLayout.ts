// PC の画面の並び（開いているタブ、ピン留め、選んでいるタブ、設定のページ、左の列で開け閉めした行）を、暗号化した手元の保存
// （core/vault/workspaceLayout.ts）に残し、ロックを解除したあと・読み込み直したあとに戻す。

import { useEffect, useMemo, useState } from "react";
import { SerialQueue } from "../../core/local/serialQueue";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { readWorkspaceLayout, type WorkspaceLayout, writeWorkspaceLayout } from "../../core/vault/workspaceLayout";
import type { UnlockedVault } from "../../core/vault/vaultSession";
import { GRAPH_TAB, notebookIdOfDatabaseTab, REMINDERS_TAB, SETTINGS_TAB, type WorkspaceNavigation } from "./useWorkspaceNavigation";

const TABS_WITHOUT_RECORD: readonly string[] = [SETTINGS_TAB, GRAPH_TAB, REMINDERS_TAB];
// 左の列のノートブックの行のキーの頭（useWorkspaceNavigation.ts の viewKey）。
const NOTEBOOK_ROW_KEY_PREFIX = "notebook:";

// タブの中身（メモか、データベース表示のノートブック）が今もあるか。完全に削除したものは、残した並びから捨てる。
function tabExistsIn(repository: NoteRepository, tabId: string): boolean {
  if (TABS_WITHOUT_RECORD.includes(tabId)) {
    return true;
  }
  const databaseNotebookId = notebookIdOfDatabaseTab(tabId);
  return databaseNotebookId === null ? repository.note(tabId) !== undefined : notebookExistsIn(repository, databaseNotebookId);
}

function notebookExistsIn(repository: NoteRepository, notebookId: string): boolean {
  return repository.notebooks().some((notebook) => notebook.id === notebookId);
}

// 消えたノートブックの行の開け閉めは捨てる（残すと、ノートブックを作って消すたびに増え続ける）。
function withoutRemovedNotebookRows(repository: NoteRepository, layout: WorkspaceLayout): WorkspaceLayout {
  const expandedRows = Object.fromEntries(Object.entries(layout.expandedRows)
    .filter(([key]) => !key.startsWith(NOTEBOOK_ROW_KEY_PREFIX) || notebookExistsIn(repository, key.slice(NOTEBOOK_ROW_KEY_PREFIX.length))));
  return { ...layout, expandedRows };
}

type RememberedWorkspaceLayoutInput = {
  vault: UnlockedVault;
  navigation: WorkspaceNavigation;
  // false の間は、読みも書きもしない（メモを 1 つだけ開く別のウィンドウと、タブの無いスマホの画面）。
  enabled: boolean;
};

export function useRememberedWorkspaceLayout({ vault, navigation, enabled }: RememberedWorkspaceLayoutInput): void {
  // 残した並びを戻し終えたか。戻す前に書くと、開いた直後の空の並びで上書きしてしまう。
  const [restored, setRestored] = useState(false);
  const { restoreLayout, openTabs, pinnedTabs, activeTab, settingsPage, expandedRows } = navigation;
  useEffect(() => {
    if (!enabled || restored) {
      return undefined;
    }
    let current = true;
    // 読めない並び（別のマスターキーで残したもの）は、残していないのと同じに扱う。
    void readWorkspaceLayout(vault.localStore, vault.masterKey).catch(() => null).then((layout) => {
      if (!current) {
        return;
      }
      if (layout) {
        restoreLayout(withoutRemovedNotebookRows(vault.repository, layout), (tabId) => tabExistsIn(vault.repository, tabId));
      }
      setRestored(true);
    });
    return () => {
      current = false;
    };
  }, [enabled, restored, vault, restoreLayout]);

  // 続けて変えたときに、古い並びがあとから書かれないよう、順に書く。
  const writes = useMemo(() => new SerialQueue(), []);
  useEffect(() => {
    if (!enabled || !restored) {
      return;
    }
    const layout: WorkspaceLayout = { openTabs, pinnedTabs, activeTab, settingsPage, expandedRows: Object.fromEntries(expandedRows) };
    void writes.run(() => writeWorkspaceLayout(vault.localStore, vault.masterKey, layout));
  }, [enabled, restored, vault, writes, openTabs, pinnedTabs, activeTab, settingsPage, expandedRows]);
}

// 案C のエディタの上のタブ。メモと設定をタブで開く。ドラッグで並べ替えられる。
// ドラッグしている間は、元のタブを薄くし、落とす先のタブの左に印を出す。
// 右クリックでタブのメニュー（閉じる・ほかを閉じる・右を閉じる・ピン留め・閉じたタブを開き直す）、
// 右端のボタンで開いているタブの一覧を出す（タブが多くて隠れたときに選べるように）。

import { Check, ChevronDown, Columns2, Pin, PinOff, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { showDragPreview } from "../shared/dragPreview";
import { PopupMenu } from "../shared/PopupMenu";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { GRAPH_TAB, notebookIdOfDatabaseTab, REMINDERS_TAB, SETTINGS_TAB, type WorkspaceNavigation } from "./useWorkspaceNavigation";

// タブが並びの外にはみ出していれば、並びだけを横に送って見せる。scrollIntoView は、並びを縦にも送り（中身が 1px 高い）、
// 外側の画面まで送ることがあるので使わない。
function scrollTabIntoStrip(strip: HTMLElement, tab: HTMLElement): void {
  const stripBox = strip.getBoundingClientRect();
  const tabBox = tab.getBoundingClientRect();
  if (tabBox.left < stripBox.left) {
    strip.scrollLeft -= stripBox.left - tabBox.left;
  } else if (tabBox.right > stripBox.right) {
    strip.scrollLeft += tabBox.right - stripBox.right;
  }
}

// タブのドラッグのデータの種類。メモのドラッグ（左の列）と区別する。
const TAB_DRAG_TYPE = "application/x-sedum-note-tab";

export function NoteTabs({ navigation, repository }: { navigation: WorkspaceNavigation; repository: NoteRepository }) {
  // ドラッグしているタブと、いま上にある落とし先のタブ。
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dropTargetTabId, setDropTargetTabId] = useState<string | null>(null);
  // 右クリックしたタブのメニューと、タブの一覧のメニュー。
  const [tabMenu, setTabMenu] = useState<{ tabId: string; anchor: HTMLElement } | null>(null);
  const [tabListAnchor, setTabListAnchor] = useState<HTMLElement | null>(null);
  const tabStrip = useRef<HTMLDivElement>(null);
  // 開いたタブ（切り替えたタブ）が、タブの並びの外に隠れていたら、見える所まで送る。並びは横に送れるが、
  // 送るためのバーを隠しているので、送らないと右端で切れたままになる。
  useEffect(() => {
    const strip = tabStrip.current;
    const activeTab = strip?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (strip && activeTab) {
      scrollTabIntoStrip(strip, activeTab);
    }
  }, [navigation.activeTab, navigation.openTabs.length]);
  const endTabDrag = () => {
    setDraggedTabId(null);
    setDropTargetTabId(null);
  };
  if (navigation.openTabs.length === 0) {
    return null;
  }
  const labelOf = (tabId: string): string => {
    const databaseNotebookId = notebookIdOfDatabaseTab(tabId);
    return tabId === SETTINGS_TAB
      ? translate("settings.title")
      : tabId === GRAPH_TAB
        ? translate("graph.title")
        : tabId === REMINDERS_TAB
        ? translate("due.title")
        : databaseNotebookId !== null
          ? repository.notebooks().find((notebook) => notebook.id === databaseNotebookId)?.content.name ?? ""
          : repository.note(tabId)?.content.title || translate("sidebar.untitled");
  };
  const runAndCloseMenu = (action: () => void) => () => {
    setTabMenu(null);
    action();
  };
  return (
    <div className="tabs-bar">
    <div ref={tabStrip} className="tabs" role="tablist">
      {navigation.openTabs.map((tabId) => {
        const label = labelOf(tabId);
        const isPinned = navigation.pinnedTabs.includes(tabId);
        const isOn = navigation.activeTab === tabId;
        return (
          <div key={tabId} className={`tab${isOn ? " on" : ""}${draggedTabId === tabId ? " dragging" : ""}${dropTargetTabId === tabId && draggedTabId !== tabId ? " drop-target" : ""}`}
            role="tab" aria-selected={isOn}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(TAB_DRAG_TYPE, tabId);
              showDragPreview(event, label);
              setDraggedTabId(tabId);
            }}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes(TAB_DRAG_TYPE)) {
                event.preventDefault();
                setDropTargetTabId(tabId);
              }
            }}
            onDragEnd={endTabDrag}
            onDrop={(event) => {
              endTabDrag();
              navigation.moveTab(event.dataTransfer.getData(TAB_DRAG_TYPE), tabId);
            }}
            onClick={() => navigation.openTab(tabId)}
            onContextMenu={(event) => { event.preventDefault(); setTabMenu({ tabId, anchor: event.currentTarget }); }}
            onAuxClick={(event) => event.button === 1 && !isPinned && navigation.closeTab(tabId)}>
            {isPinned && <Pin size={12} className="tab-pin" aria-label={translate("tabs.pinned")} />}
            <span className="tab-label">{label}</span>
            {/* ピン留めしたタブは、うっかり閉じないよう × を出さない（右クリックのメニューからは閉じられる）。 */}
            {!isPinned && (
              <button className="tab-close" aria-label={translate("editor.closeTab")}
                onClick={(event) => { event.stopPropagation(); navigation.closeTab(tabId); }}>
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
      <div className="tabs-end">
        <button type="button" className="icon-button" aria-label={translate("tabs.list")} title={translate("tabs.list")} aria-haspopup="menu"
          onClick={(event) => setTabListAnchor(tabListAnchor ? null : event.currentTarget)}>
          <ChevronDown size={16} />
        </button>
      </div>
      {tabMenu && (
        <PopupMenu anchor={tabMenu.anchor} onClose={() => setTabMenu(null)}>
          <button className="menu-item" role="menuitem" onClick={runAndCloseMenu(() => navigation.closeTab(tabMenu.tabId))}>
            <X size={15} />{translate("editor.closeTab")}
          </button>
          <button className="menu-item" role="menuitem" onClick={runAndCloseMenu(() => navigation.closeOtherTabs(tabMenu.tabId))}>
            <X size={15} />{translate("tabs.closeOthers")}
          </button>
          <button className="menu-item" role="menuitem" onClick={runAndCloseMenu(() => navigation.closeTabsToRight(tabMenu.tabId))}>
            <X size={15} />{translate("tabs.closeToRight")}
          </button>
          <div className="menu-separator" />
          {repository.note(tabMenu.tabId) && (
            <button className="menu-item" role="menuitem" onClick={runAndCloseMenu(() => navigation.openInSplit(tabMenu.tabId))}>
              <Columns2 size={15} />{translate("split.open")}
            </button>
          )}
          <button className="menu-item" role="menuitem" onClick={runAndCloseMenu(() => navigation.togglePinnedTab(tabMenu.tabId))}>
            {navigation.pinnedTabs.includes(tabMenu.tabId) ? <PinOff size={15} /> : <Pin size={15} />}
            {translate(navigation.pinnedTabs.includes(tabMenu.tabId) ? "tabs.unpin" : "tabs.pin")}
          </button>
          <button className="menu-item" role="menuitem" onClick={runAndCloseMenu(() => navigation.reopenClosedTab())}>
            <RotateCcw size={15} />{translate("shortcut.reopenClosedTab")}
          </button>
        </PopupMenu>
      )}
      {tabListAnchor && (
        <PopupMenu anchor={tabListAnchor} onClose={() => setTabListAnchor(null)}>
          {navigation.openTabs.map((tabId) => (
            <button key={tabId} className="menu-item" role="menuitem" onClick={() => { setTabListAnchor(null); navigation.openTab(tabId); }}>
              <span className="nav-label">{labelOf(tabId)}</span>
              {navigation.activeTab === tabId && <Check size={15} className="menu-check" />}
            </button>
          ))}
        </PopupMenu>
      )}
    </div>
  );
}

// 案C のエディタの上のタブ。メモと設定をタブで開く。ドラッグで並べ替えられる。
// ドラッグしている間は、元のタブを薄くし、落とす先のタブの左に印を出す。
// 右クリックでタブのメニュー（閉じる・ほかを閉じる・右を閉じる・ピン留め・閉じたタブを開き直す）、
// 右端のボタンで開いているタブの一覧を出す（タブが多くて隠れたときに選べるように）。
// キーボードでは、Tab で選んでいるタブへ移り、← → Home End でタブを切り替え、Shift+F10 かメニューのキーでタブのメニューを開く。
// ピン留めしたタブは、並びを横に送っても左端に留まる（stickyPinnedTabs.ts）。並びに続きがある側の端は、ぼかして見せる。

import { Check, ChevronDown, Columns2, Pin, PinOff, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { showDragPreview } from "../shared/dragPreview";
import { PopupMenu } from "../shared/PopupMenu";
import { useHorizontalScrollEdges } from "../shared/useHorizontalScrollEdges";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { GRAPH_TAB, notebookIdOfDatabaseTab, REMINDERS_TAB, SETTINGS_TAB, type WorkspaceNavigation } from "./useWorkspaceNavigation";
import { pinnedTabsRightEdge, useStickyPinnedTabs } from "./stickyPinnedTabs";
import { PinnedTabIcon } from "./PinnedTabIcon";
import { ICON_SIZE } from "../shared/iconSizes";

// タブが並びの外にはみ出していれば、並びだけを横に送って見せる。scrollIntoView は、並びを縦にも送り（中身が 1px 高い）、
// 外側の画面まで送ることがあるので使わない。左端に留めたピン留めのタブの下に隠れている所も、外と同じに扱う。
function scrollTabIntoStrip(strip: HTMLElement, tab: HTMLElement): void {
  const stripBox = strip.getBoundingClientRect();
  const tabBox = tab.getBoundingClientRect();
  const visibleLeft = tab.classList.contains("pinned") ? stripBox.left : pinnedTabsRightEdge(strip) ?? stripBox.left;
  if (tabBox.left < visibleLeft) {
    strip.scrollLeft -= visibleLeft - tabBox.left;
  } else if (tabBox.right > stripBox.right) {
    strip.scrollLeft += tabBox.right - stripBox.right;
  }
}

// 押したキーごとの、移る先のタブの番号。← → は端で止まる。
const TAB_MOVES: Record<string, (index: number, tabCount: number) => number> = {
  ArrowRight: (index, tabCount) => Math.min(index + 1, tabCount - 1),
  ArrowLeft: (index) => Math.max(index - 1, 0),
  Home: () => 0,
  End: (_index, tabCount) => tabCount - 1,
};

// 右クリックのメニューをキーボードで開くキー（メニューのキーと、Shift+F10）。
function isContextMenuKey(event: React.KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

// タブのドラッグのデータの種類。メモのドラッグ（左の列）と区別する。
const TAB_DRAG_TYPE = "application/x-sedum-note-tab";

type NoteTabsProps = { navigation: WorkspaceNavigation; repository: NoteRepository };

// タブが 1 つも無ければ、タブの列ごと出さない。
export function NoteTabs(props: NoteTabsProps) {
  return props.navigation.openTabs.length === 0 ? null : <OpenTabsBar {...props} />;
}

// タブの列。タブがある間だけ置く（横に送れる並びの端を見張る仕組みは、並びの要素ができたときに付けるので）。
function OpenTabsBar({ navigation, repository }: NoteTabsProps) {
  // ドラッグしているタブと、いま上にある落とし先のタブ。
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dropTargetTabId, setDropTargetTabId] = useState<string | null>(null);
  // 右クリックしたタブのメニューと、タブの一覧のメニュー。
  const [tabMenu, setTabMenu] = useState<{ tabId: string; anchor: HTMLElement } | null>(null);
  const [tabListAnchor, setTabListAnchor] = useState<HTMLElement | null>(null);
  const tabStrip = useHorizontalScrollEdges<HTMLDivElement>();
  useStickyPinnedTabs(tabStrip);
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
  // タブの上で押したキー。切り替えたタブへフォーカスも移す（選んでいるタブだけが Tab で止まる所なので）。
  const moveOrOpenMenuByKey = (event: React.KeyboardEvent<HTMLDivElement>, tabId: string) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (isContextMenuKey(event)) {
      event.preventDefault();
      setTabMenu({ tabId, anchor: event.currentTarget });
      return;
    }
    const move = TAB_MOVES[event.key];
    if (move === undefined || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    event.preventDefault();
    const { openTabs } = navigation;
    const nextIndex = move(openTabs.indexOf(tabId), openTabs.length);
    const nextTabId = openTabs[nextIndex];
    if (nextTabId !== undefined && nextTabId !== tabId) {
      navigation.openTab(nextTabId);
      (tabStrip.current?.children[nextIndex] as HTMLElement | undefined)?.focus();
    }
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
          <div key={tabId} className={`tab${isOn ? " on" : ""}${isPinned ? " pinned" : ""}${draggedTabId === tabId ? " dragging" : ""}${dropTargetTabId === tabId && draggedTabId !== tabId ? " drop-target" : ""}`}
            role="tab" aria-selected={isOn} tabIndex={isOn ? 0 : -1} title={label} aria-label={isPinned ? label : undefined} aria-haspopup="menu"
            onKeyDown={(event) => moveOrOpenMenuByKey(event, tabId)}
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
            {/* ピン留めしたタブは、アイコンだけを出す（題は title で出し、読み上げの名前にもする）。 */}
            {isPinned && <PinnedTabIcon tabId={tabId} repository={repository} />}
            <span className="tab-label">{label}</span>
            {/* ピン留めしたタブは、うっかり閉じないよう × を出さない（右クリックのメニューからは閉じられる）。 */}
            {!isPinned && (
              <button className="tab-close" aria-label={translate("editor.closeTab")}
                onClick={(event) => { event.stopPropagation(); navigation.closeTab(tabId); }}>
                <X size={ICON_SIZE.chip} />
              </button>
            )}
          </div>
        );
      })}
    </div>
      <div className="tabs-end">
        <button type="button" className="icon-button" aria-label={translate("tabs.list")} title={translate("tabs.list")} aria-haspopup="menu"
          onClick={(event) => setTabListAnchor(tabListAnchor ? null : event.currentTarget)}>
          <ChevronDown size={ICON_SIZE.button} />
        </button>
      </div>
      {tabMenu && (
        <PopupMenu anchor={tabMenu.anchor} onClose={() => setTabMenu(null)}>
          <button className="menu-item" role="menuitem" onClick={runAndCloseMenu(() => navigation.closeTab(tabMenu.tabId))}>
            <X size={ICON_SIZE.row} />{translate("editor.closeTab")}
          </button>
          <button className="menu-item" role="menuitem" onClick={runAndCloseMenu(() => navigation.closeOtherTabs(tabMenu.tabId))}>
            <X size={ICON_SIZE.row} />{translate("tabs.closeOthers")}
          </button>
          <button className="menu-item" role="menuitem" onClick={runAndCloseMenu(() => navigation.closeTabsToRight(tabMenu.tabId))}>
            <X size={ICON_SIZE.row} />{translate("tabs.closeToRight")}
          </button>
          <div className="menu-separator" />
          {repository.note(tabMenu.tabId) && (
            <button className="menu-item" role="menuitem" onClick={runAndCloseMenu(() => navigation.openInSplit(tabMenu.tabId))}>
              <Columns2 size={ICON_SIZE.row} />{translate("split.open")}
            </button>
          )}
          <button className="menu-item" role="menuitem" onClick={runAndCloseMenu(() => navigation.togglePinnedTab(tabMenu.tabId))}>
            {navigation.pinnedTabs.includes(tabMenu.tabId) ? <PinOff size={ICON_SIZE.row} /> : <Pin size={ICON_SIZE.row} />}
            {translate(navigation.pinnedTabs.includes(tabMenu.tabId) ? "tabs.unpin" : "tabs.pin")}
          </button>
          <button className="menu-item" role="menuitem" onClick={runAndCloseMenu(() => navigation.reopenClosedTab())}>
            <RotateCcw size={ICON_SIZE.row} />{translate("shortcut.reopenClosedTab")}
          </button>
        </PopupMenu>
      )}
      {tabListAnchor && (
        <PopupMenu anchor={tabListAnchor} onClose={() => setTabListAnchor(null)}>
          {navigation.openTabs.map((tabId) => (
            <button key={tabId} className="menu-item" role="menuitem" onClick={() => { setTabListAnchor(null); navigation.openTab(tabId); }}>
              <span className="nav-label">{labelOf(tabId)}</span>
              {navigation.activeTab === tabId && <Check size={ICON_SIZE.row} className="menu-check" />}
            </button>
          ))}
        </PopupMenu>
      )}
    </div>
  );
}

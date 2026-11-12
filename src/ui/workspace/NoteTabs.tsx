// 案C のエディタの上のタブ。メモと設定をタブで開く。ドラッグで並べ替えられる。
// ドラッグしている間は、元のタブを薄くし、落とす先のタブの左に印を出す。

import { X } from "lucide-react";
import { useState } from "react";
import { showDragPreview } from "../shared/dragPreview";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { GRAPH_TAB, notebookIdOfDatabaseTab, REMINDERS_TAB, SETTINGS_TAB, type WorkspaceNavigation } from "./useWorkspaceNavigation";

// タブのドラッグのデータの種類。メモのドラッグ（左の列）と区別する。
const TAB_DRAG_TYPE = "application/x-sedum-note-tab";

export function NoteTabs({ navigation, repository }: { navigation: WorkspaceNavigation; repository: NoteRepository }) {
  // ドラッグしているタブと、いま上にある落とし先のタブ。
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dropTargetTabId, setDropTargetTabId] = useState<string | null>(null);
  const endTabDrag = () => {
    setDraggedTabId(null);
    setDropTargetTabId(null);
  };
  if (navigation.openTabs.length === 0) {
    return null;
  }
  return (
    <div className="tabs" role="tablist">
      {navigation.openTabs.map((tabId) => {
        const databaseNotebookId = notebookIdOfDatabaseTab(tabId);
        const label = tabId === SETTINGS_TAB
          ? translate("settings.title")
          : tabId === GRAPH_TAB
            ? translate("graph.title")
            : tabId === REMINDERS_TAB
            ? translate("due.title")
            : databaseNotebookId !== null
            ? repository.notebooks().find((notebook) => notebook.id === databaseNotebookId)?.content.name ?? ""
            : repository.note(tabId)?.content.title || translate("sidebar.untitled");
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
            onAuxClick={(event) => event.button === 1 && navigation.closeTab(tabId)}>
            <span className="tab-label">{label}</span>
            <button className="tab-close" aria-label={translate("editor.closeTab")}
              onClick={(event) => { event.stopPropagation(); navigation.closeTab(tabId); }}>
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

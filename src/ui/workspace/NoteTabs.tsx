// 案C のエディタの上のタブ。メモと設定をタブで開く。ドラッグで並べ替えられる。

import { X } from "lucide-react";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { notebookIdOfDatabaseTab, SETTINGS_TAB, type WorkspaceNavigation } from "./useWorkspaceNavigation";

// タブのドラッグのデータの種類。メモのドラッグ（左の列）と区別する。
const TAB_DRAG_TYPE = "application/x-sedum-note-tab";

export function NoteTabs({ navigation, repository }: { navigation: WorkspaceNavigation; repository: NoteRepository }) {
  if (navigation.openTabs.length === 0) {
    return null;
  }
  return (
    <div className="tabs" role="tablist">
      {navigation.openTabs.map((tabId) => {
        const databaseNotebookId = notebookIdOfDatabaseTab(tabId);
        const label = tabId === SETTINGS_TAB
          ? translate("settings.title")
          : databaseNotebookId !== null
            ? repository.notebooks().find((notebook) => notebook.id === databaseNotebookId)?.content.name ?? ""
            : repository.note(tabId)?.content.title || translate("sidebar.untitled");
        const isOn = navigation.activeTab === tabId;
        return (
          <div key={tabId} className={`tab${isOn ? " on" : ""}`} role="tab" aria-selected={isOn}
            draggable onDragStart={(event) => event.dataTransfer.setData(TAB_DRAG_TYPE, tabId)}
            onDragOver={(event) => event.dataTransfer.types.includes(TAB_DRAG_TYPE) && event.preventDefault()}
            onDrop={(event) => navigation.moveTab(event.dataTransfer.getData(TAB_DRAG_TYPE), tabId)}
            onClick={() => (tabId === SETTINGS_TAB ? navigation.openSettings() : navigation.openNote(tabId))}
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

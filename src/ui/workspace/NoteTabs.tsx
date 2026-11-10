// 案C のエディタの上のタブ。メモと設定をタブで開く。

import { X } from "lucide-react";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { SETTINGS_TAB, type WorkspaceNavigation } from "./useWorkspaceNavigation";

export function NoteTabs({ navigation, repository }: { navigation: WorkspaceNavigation; repository: NoteRepository }) {
  if (navigation.openTabs.length === 0) {
    return null;
  }
  return (
    <div className="tabs" role="tablist">
      {navigation.openTabs.map((tabId) => {
        const label = tabId === SETTINGS_TAB
          ? translate("settings.title")
          : repository.note(tabId)?.content.title || translate("sidebar.untitled");
        const isOn = navigation.activeTab === tabId;
        return (
          <div key={tabId} className={`tab${isOn ? " on" : ""}`} role="tab" aria-selected={isOn}
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

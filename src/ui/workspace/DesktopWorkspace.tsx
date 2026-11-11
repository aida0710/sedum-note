// 案C の PC の組み方: 左にノートブックの木、右にタブとエディタ。

import { translate } from "../i18n/translate";
import { NoteEditor } from "../editor/NoteEditor";
import { createNoteLinkTargets, NoteLinkTargetsContext } from "../editor/noteLinkTargets";
import { SettingsPanel } from "../settings/SettingsPanel";
import type { WorkspaceProps } from "./workspaceProps";
import { NoteTabs } from "./NoteTabs";
import { Sidebar } from "./Sidebar";
import { SyncStatusLine } from "./SyncStatusLine";
import { createNoteInView } from "./createNoteInView";
import { useKeyboardShortcuts } from "./keyboardShortcuts";
import { UpdateChip } from "../update/UpdateChip";
import { SETTINGS_TAB } from "./useWorkspaceNavigation";

export function DesktopWorkspace({ session, vault, snapshot, navigation }: WorkspaceProps) {
  const { repository } = vault;
  const activeNote = navigation.activeTab && navigation.activeTab !== SETTINGS_TAB ? repository.note(navigation.activeTab) : undefined;
  const createNote = async () => navigation.openNote((await createNoteInView(repository, navigation.view)).id);
  const openNeighborTab = (step: 1 | -1) => {
    const { openTabs, activeTab } = navigation;
    const neighbor = openTabs[(openTabs.indexOf(activeTab ?? "") + step + openTabs.length) % openTabs.length];
    if (neighbor === SETTINGS_TAB) {
      navigation.openSettings();
    } else if (neighbor !== undefined) {
      navigation.openNote(neighbor);
    }
  };
  useKeyboardShortcuts({
    newNote: () => void createNote(),
    searchNotes: navigation.requestSearchFocus,
    findInNote: navigation.requestFindInNote,
    nextTab: () => openNeighborTab(1),
    previousTab: () => openNeighborTab(-1),
    closeTab: () => navigation.activeTab && navigation.closeTab(navigation.activeTab),
    openSettings: navigation.openSettings,
  });
  return (
    <div className="workspace">
      <Sidebar snapshot={snapshot} repository={repository} navigation={navigation} onCreateNote={() => void createNote()}
        footer={<><UpdateChip onOpenSettings={navigation.openSettings} /><SyncStatusLine status={session.syncStatus} onOpenSettings={navigation.openSettings} /></>} />
      <main className="main">
        <NoteTabs navigation={navigation} repository={repository} />
        {navigation.activeTab === SETTINGS_TAB && (
          <SettingsPanel session={session} vault={vault} unreadableCount={snapshot.unreadableCount} isMobile={false} />
        )}
        {activeNote && (
          <NoteLinkTargetsContext.Provider value={createNoteLinkTargets(repository, navigation.openNote)}>
            <NoteEditor key={activeNote.id} note={activeNote} notebooks={snapshot.notebooks} repository={repository} isMobile={false}
              highlightedText={navigation.searchText} findRequest={navigation.findInNoteRequest} />
          </NoteLinkTargetsContext.Provider>
        )}
        {!activeNote && navigation.activeTab !== SETTINGS_TAB && <div className="empty-state">{translate("editor.empty")}</div>}
      </main>
    </div>
  );
}

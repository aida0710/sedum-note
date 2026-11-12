// 案C の PC の組み方: 左にノートブックの木、右にタブとエディタ。

import { Minimize2 } from "lucide-react";
import { useState } from "react";
import { languageInUse } from "../i18n/languageInUse";
import { translate } from "../i18n/translate";
import { readDevicePreferences, updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { dailyNoteTitle, findOrCreateDailyNote } from "./dailyNote";
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
import { notesLinkingTo } from "../../core/notes/noteQueries";

export function DesktopWorkspace({ session, vault, snapshot, navigation }: WorkspaceProps) {
  const { repository } = vault;
  const activeNote = navigation.activeTab && navigation.activeTab !== SETTINGS_TAB ? repository.note(navigation.activeTab) : undefined;
  const createNote = async () => navigation.openNote((await createNoteInView(repository, navigation.view)).id);
  const openDailyNote = async () => {
    const { dailyNoteTitleFormat, dailyNoteNotebookId } = readDevicePreferences();
    const title = dailyNoteTitle(dailyNoteTitleFormat, new Date(), languageInUse());
    navigation.openNote((await findOrCreateDailyNote({ repository, title, notebookId: dailyNoteNotebookId })).id);
  };
  // フォーカスモード: 左の列・タブ・ツールバーを隠して、本文だけにする。開き直すと戻る。
  const [focusMode, setFocusMode] = useState(false);
  const { typewriterMode } = useDevicePreferences();
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
    dailyNote: () => void openDailyNote(),
    focusMode: () => setFocusMode((on) => !on),
    typewriterMode: () => updateDevicePreferences({ typewriterMode: !readDevicePreferences().typewriterMode }),
  });
  return (
    <div className={`workspace${focusMode ? " focus-mode" : ""}${typewriterMode ? " typewriter-mode" : ""}`}>
      {focusMode && (
        <button className="icon-button focus-mode-exit" aria-label={translate("workspace.exitFocusMode")} title={translate("workspace.exitFocusMode")}
          onClick={() => setFocusMode(false)}><Minimize2 size={16} /></button>
      )}
      <Sidebar snapshot={snapshot} repository={repository} navigation={navigation} onCreateNote={() => void createNote()}
        onOpenDailyNote={() => void openDailyNote()} onEnterFocusMode={() => setFocusMode(true)}
        footer={<><UpdateChip onOpenSettings={navigation.openSettings} /><SyncStatusLine status={session.syncStatus} onOpenSettings={navigation.openSettings} /></>} />
      <main className="main">
        <NoteTabs navigation={navigation} repository={repository} />
        {navigation.activeTab === SETTINGS_TAB && (
          <SettingsPanel session={session} vault={vault} unreadableCount={snapshot.unreadableCount} isMobile={false} />
        )}
        {activeNote && (
          <NoteLinkTargetsContext.Provider value={createNoteLinkTargets(repository, navigation.openNote)}>
            <NoteEditor key={activeNote.id} note={activeNote} notebooks={snapshot.notebooks} backlinks={notesLinkingTo(snapshot.summaries, activeNote.id)}
              repository={repository} isMobile={false}
              highlightedText={navigation.searchText} findRequest={navigation.findInNoteRequest} />
          </NoteLinkTargetsContext.Provider>
        )}
        {!activeNote && navigation.activeTab !== SETTINGS_TAB && <div className="empty-state">{translate("editor.empty")}</div>}
      </main>
    </div>
  );
}

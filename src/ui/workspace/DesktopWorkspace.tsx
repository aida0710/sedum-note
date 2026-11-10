// 案C の PC の組み方: 左にノートブックの木、右にタブとエディタ。

import { translate } from "../i18n/translate";
import { NoteEditor } from "../editor/NoteEditor";
import { SettingsPanel } from "../settings/SettingsPanel";
import type { WorkspaceProps } from "./workspaceProps";
import { NoteTabs } from "./NoteTabs";
import { Sidebar } from "./Sidebar";
import { SyncStatusLine } from "./SyncStatusLine";
import { createNoteInView } from "./createNoteInView";
import { SETTINGS_TAB } from "./useWorkspaceNavigation";

export function DesktopWorkspace({ session, vault, snapshot, navigation }: WorkspaceProps) {
  const { repository } = vault;
  const activeNote = navigation.activeTab && navigation.activeTab !== SETTINGS_TAB ? repository.note(navigation.activeTab) : undefined;
  const createNote = async () => navigation.openNote((await createNoteInView(repository, navigation.view)).id);
  return (
    <div className="workspace">
      <Sidebar snapshot={snapshot} repository={repository} navigation={navigation} onCreateNote={() => void createNote()}
        footer={<SyncStatusLine status={session.syncStatus} onOpenSettings={navigation.openSettings} />} />
      <main className="main">
        <NoteTabs navigation={navigation} repository={repository} />
        {navigation.activeTab === SETTINGS_TAB && (
          <SettingsPanel session={session} remoteConfig={vault.remoteConfig} unreadableCount={snapshot.unreadableCount} />
        )}
        {activeNote && (
          <NoteEditor key={activeNote.id} note={activeNote} notebooks={snapshot.notebooks} repository={repository}
            syncConfigured={vault.remoteConfig !== null} isMobile={false} />
        )}
        {!activeNote && navigation.activeTab !== SETTINGS_TAB && <div className="empty-state">{translate("editor.empty")}</div>}
      </main>
    </div>
  );
}

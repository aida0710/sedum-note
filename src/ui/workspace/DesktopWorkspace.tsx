// 案C の PC の組み方: 左にノートブックの木、右にタブとエディタ。

import { Minimize2, Settings } from "lucide-react";
import { useContext, useState } from "react";
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
import { CommandPalette } from "./CommandPalette";
import { KEYBOARD_SHORTCUTS, type ShortcutId, useKeyboardShortcuts } from "./keyboardShortcuts";
import { shortcutText } from "../shared/shortcutKeys";
import { UpdateChip } from "../update/UpdateChip";
import { NotebookDatabaseView } from "./NotebookDatabaseView";
import { NoteGraphView } from "./NoteGraphView";
import { GRAPH_TAB, notebookIdOfDatabaseTab, SETTINGS_TAB } from "./useWorkspaceNavigation";
import { findUnlinkedMentions } from "../../core/notes/noteMentions";
import { notesLinkingTo } from "../../core/notes/noteQueries";
import { parseNoteSearchQuery } from "../../core/notes/noteSearchQuery";
import { NoteQuerySourceContext } from "../editor/noteQuerySource";
import { AiChat } from "../ai/AiChat";
import { McpSectionSlot } from "../settings/mcpSectionSlot";
import { SETTINGS_SEARCH_ENTRIES } from "../settings/settingsSearchEntries";
import { workspacePaletteCandidates } from "./workspacePaletteCandidates";
import { useAiChatSession } from "../ai/aiChatSession";
import { LockedNoteGate } from "../editor/LockedNoteGate";
import { useNoteLockState } from "../session/noteLockState";

export function DesktopWorkspace({ session, vault, snapshot, navigation }: WorkspaceProps) {
  const { repository } = vault;
  const showsGraph = navigation.activeTab === GRAPH_TAB;
  const activeNote = navigation.activeTab && navigation.activeTab !== SETTINGS_TAB && !showsGraph ? repository.note(navigation.activeTab) : undefined;
  const { concealedNoteIds } = useNoteLockState();
  const activeNoteIsConcealed = activeNote !== undefined && concealedNoteIds.has(activeNote.id);
  const databaseNotebook = snapshot.notebooks.find((notebook) => notebook.id === notebookIdOfDatabaseTab(navigation.activeTab));
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
  const aiChat = useAiChatSession();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const shortcutHandlers: Record<ShortcutId, () => void> = {
    commandPalette: () => setPaletteOpen(true),
    newNote: () => void createNote(),
    searchNotes: navigation.requestSearchFocus,
    findInNote: () => navigation.requestFindInNote(),
    replaceInNote: () => navigation.requestFindInNote(true),
    nextTab: () => openNeighborTab(1),
    previousTab: () => openNeighborTab(-1),
    closeTab: () => navigation.activeTab && navigation.closeTab(navigation.activeTab),
    reopenClosedTab: () => void navigation.reopenClosedTab(),
    openSettings: () => navigation.openSettings(),
    graph: () => navigation.openTab(GRAPH_TAB),
    aiChat: () => aiChat.setOpen(!aiChat.open),
    dailyNote: () => void openDailyNote(),
    focusMode: () => setFocusMode((on) => !on),
    typewriterMode: () => updateDevicePreferences({ typewriterMode: !readDevicePreferences().typewriterMode }),
    lock: () => void session.lock(),
  };
  useKeyboardShortcuts(shortcutHandlers);
  // コマンドパレットに並べる操作。ショートカットの一覧と同じもの（パレットを開く操作は除く）。
  const paletteCommands = KEYBOARD_SHORTCUTS.filter((shortcut) => shortcut.id !== "commandPalette")
    .map((shortcut) => ({ id: shortcut.id, label: translate(shortcut.label), shortcut: shortcutText(shortcut.keys), run: shortcutHandlers[shortcut.id] }));
  // MCP の欄は PC 版（デスクトップのアプリ）にだけある。無い版では、パレットの設定の項目からも外す。
  const includesMcp = useContext(McpSectionSlot) !== null;
  return (
    <div className={`workspace${focusMode ? " focus-mode" : ""}${typewriterMode ? " typewriter-mode" : ""}${aiChat.open ? " with-ai-chat" : ""}`}>
      {focusMode && (
        <button className="icon-button focus-mode-exit" aria-label={translate("workspace.exitFocusMode")} title={translate("workspace.exitFocusMode")}
          onClick={() => setFocusMode(false)}><Minimize2 size={16} /></button>
      )}
      <Sidebar snapshot={snapshot} repository={repository} navigation={navigation} onCreateNote={() => void createNote()}
        onOpenDailyNote={() => void openDailyNote()} onEnterFocusMode={() => setFocusMode(true)} onOpenGraph={() => navigation.openTab(GRAPH_TAB)}
        footer={(
          <>
            <UpdateChip onOpenSettings={() => navigation.openSettings("update")} />
            <div className="sidebar-footer">
              <SyncStatusLine status={session.syncStatus} onOpenSyncSettings={() => navigation.openSettings("sync")} />
              <button type="button" className="icon-button" aria-label={translate("settings.title")} title={translate("settings.title")}
                onClick={() => navigation.openSettings()}>
                <Settings size={16} />
              </button>
            </div>
          </>
        )} />
      {paletteOpen && (
        <CommandPalette onClose={() => setPaletteOpen(false)}
          onCreateNote={(title) => void createNoteInView(repository, navigation.view, title).then((note) => navigation.openNote(note.id))}
          candidates={workspacePaletteCandidates({
          summaries: snapshot.summaries, notebooks: snapshot.notebooks, commands: paletteCommands, navigation,
          settingsEntries: SETTINGS_SEARCH_ENTRIES.filter((entry) => includesMcp || !entry.desktopAppOnly),
        })} />
      )}
      <main className="main">
        <NoteTabs navigation={navigation} repository={repository} />
        {navigation.activeTab === SETTINGS_TAB && (
          <SettingsPanel session={session} vault={vault} unreadableCount={snapshot.unreadableCount} isMobile={false}
            page={navigation.settingsPage} onSelectPage={navigation.selectSettingsPage} revealRequest={navigation.settingRevealRequest} />
        )}
        {activeNote && activeNoteIsConcealed && (
          <LockedNoteGate key={activeNote.id} title={activeNote.content.title} verifyPassphrase={session.verifyPassphrase}
            onRevealed={() => navigation.revealLockedNote(activeNote.id)} />
        )}
        {activeNote && !activeNoteIsConcealed && (
          <NoteLinkTargetsContext.Provider value={createNoteLinkTargets({ repository, navigation, concealedNoteIds })}>
            <NoteQuerySourceContext.Provider value={{ summaries: snapshot.summaries, notebooks: snapshot.notebooks }}>
              <NoteEditor key={activeNote.id} note={activeNote} notebooks={snapshot.notebooks} backlinks={notesLinkingTo(snapshot.summaries, activeNote.id)}
                unlinkedMentions={findUnlinkedMentions(snapshot.summaries, activeNote)}
              repository={repository} isMobile={false}
              highlightedText={parseNoteSearchQuery(navigation.searchText).words.join(" ")} findRequest={navigation.findInNoteRequest} />
            </NoteQuerySourceContext.Provider>
          </NoteLinkTargetsContext.Provider>
        )}
        {databaseNotebook && (
          <NotebookDatabaseView notebook={databaseNotebook} repository={repository} onOpenNote={navigation.openNote}
            notes={snapshot.notes.filter((note) => note.content.notebookIds.includes(databaseNotebook.id) && note.content.trashedAt === null && !note.content.isTemplate)} />
        )}
        {showsGraph && <NoteGraphView summaries={snapshot.summaries} onOpenNote={navigation.openNote} />}
        {!activeNote && !databaseNotebook && !showsGraph && navigation.activeTab !== SETTINGS_TAB && <div className="empty-state">{translate("editor.empty")}</div>}
      </main>
      {aiChat.open && (
        <AiChat repository={repository} notes={snapshot.notes.filter((note) => note.content.trashedAt === null && !concealedNoteIds.has(note.id))} onClose={() => aiChat.setOpen(false)} />
      )}
    </div>
  );
}

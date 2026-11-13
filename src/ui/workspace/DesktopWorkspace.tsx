// 案C の PC の組み方: 左にノートブックの木、右にタブとエディタ。

import { ChevronLeft, Settings } from "lucide-react";
import { useCallback, useContext, useState } from "react";
import { translate } from "../i18n/translate";
import { readDevicePreferences, updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { NoteEditor } from "../editor/NoteEditor";
import { createNoteLinkTargets, NoteLinkTargetsContext } from "../editor/noteLinkTargets";
import { SettingsPanel } from "../settings/SettingsPanel";
import type { WorkspaceProps } from "./workspaceProps";
import { NoteTabs } from "./NoteTabs";
import { Sidebar } from "./Sidebar";
import { SyncStatusLine } from "./SyncStatusLine";
import { useExitFocusModeOnEscape } from "./useExitFocusModeOnEscape";
import { createNoteInView } from "./createNoteInView";
import { CommandPalette } from "./CommandPalette";
import { EmptyEditorPane } from "./EmptyEditorPane";
import { openNoteCommands } from "./openNoteCommands";
import { workspaceCommands } from "./workspaceCommands";
import { useTrashWithUndo } from "./useTrashWithUndo";
import { APP_SHORTCUT_IDS, useKeyboardShortcuts } from "./keyboardShortcuts";
import { UpdateChip } from "../update/UpdateChip";
import { NotebookDatabaseView } from "./NotebookDatabaseView";
import { NoteGraphView } from "./NoteGraphView";
import { RemindersView } from "./RemindersView";
import { SplitNotePane } from "./SplitNotePane";
import { GRAPH_TAB, notebookIdOfDatabaseTab, REMINDERS_TAB, SETTINGS_TAB } from "./useWorkspaceNavigation";
import { notesLinkingTo } from "../../core/notes/noteQueries";
import { parseNoteSearchQuery } from "../../core/notes/noteSearchQuery";
import { NoteQuerySourceContext } from "../editor/noteQuerySource";
import { AiChat } from "../ai/AiChat";
import { McpSectionSlot } from "../settings/mcpSectionSlot";
import { SETTINGS_SEARCH_ENTRIES } from "../settings/settingsSearchEntries";
import { workspacePaletteCandidates } from "./workspacePaletteCandidates";
import { useAiChatSession } from "../ai/aiChatSession";
import { shortcutTextOf } from "../shortcuts/shortcutBindings";
import { type AppShortcutId, shortcutDefinition } from "../shortcuts/shortcutCatalog";
import { useDialogs } from "../shared/DialogProvider";
import { useToast } from "../shared/ToastProvider";
import { describeError } from "../i18n/describeError";
import { useCurrentSpaceId } from "../session/currentSpace";
import { useSpaceRegistry } from "../session/spaceRegistry";

export function DesktopWorkspace({ session, vault, snapshot, navigation, isNoteWindow }: WorkspaceProps) {
  const { repository } = vault;
  const showsGraph = navigation.activeTab === GRAPH_TAB;
  const showsReminders = navigation.activeTab === REMINDERS_TAB;
  const activeNote = navigation.activeTab && navigation.activeTab !== SETTINGS_TAB && !showsGraph && !showsReminders ? repository.note(navigation.activeTab) : undefined;
  // 画面分割の右側のメモ。完全に削除されたら、右側を閉じた形になる。
  const splitNote = navigation.splitNoteId === null ? undefined : repository.note(navigation.splitNoteId);
  const databaseNotebook = snapshot.notebooks.find((notebook) => notebook.id === notebookIdOfDatabaseTab(navigation.activeTab));
  const createNote = async () => navigation.openNote((await createNoteInView(repository, navigation.view)).id);
  // フォーカスモード: 左の列・タブ・ツールバーを隠して、本文だけにする。開き直すと戻る。
  const [focusMode, setFocusMode] = useState(false);
  const exitFocusMode = useCallback(() => setFocusMode(false), []);
  useExitFocusModeOnEscape(focusMode, exitFocusMode);
  const { typewriterMode, shortcutOverrides } = useDevicePreferences();
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
  const shortcutHandlers: Record<AppShortcutId, () => void> = {
    commandPalette: () => setPaletteOpen(true),
    newNote: () => void createNote(),
    searchNotes: navigation.requestSearchFocus,
    findInNote: () => navigation.requestFindInNote(),
    replaceInNote: () => navigation.requestFindInNote(true),
    nextTab: () => openNeighborTab(1),
    previousTab: () => openNeighborTab(-1),
    // ピン留めしたタブは、「×」と中クリックと同じく、キーでも閉じない（閉じるのはタブのメニューから）。
    closeTab: () => navigation.activeTab && !navigation.pinnedTabs.includes(navigation.activeTab) && navigation.closeTab(navigation.activeTab),
    reopenClosedTab: () => void navigation.reopenClosedTab(),
    openSettings: () => navigation.openSettings(),
    graph: () => navigation.openTab(GRAPH_TAB),
    reminders: () => navigation.openTab(REMINDERS_TAB),
    aiChat: () => aiChat.setOpen(!aiChat.open),
    focusMode: () => setFocusMode((on) => !on),
    typewriterMode: () => updateDevicePreferences({ typewriterMode: !readDevicePreferences().typewriterMode }),
    lock: () => void session.lock(),
  };
  useKeyboardShortcuts(shortcutHandlers);
  // コマンドパレットに並べる操作。どこでも効くショートカットと同じもの（パレットを開く操作は除く）。キーなしにしたものは、キーを出さない。
  // その下に、開いているメモ・タブ・同期への、キーの無い操作を足す。
  // 同期の失敗は、左下の同期の状態に出る（SyncStatusLine.tsx）ので、ここでは受けるだけにする。
  const syncNowFromPalette = () => void session.syncNow().catch(() => undefined);
  const moveToTrash = useTrashWithUndo(repository);
  const dialogs = useDialogs();
  const showToast = useToast();
  const spaceId = useCurrentSpaceId();
  const { spaces } = useSpaceRegistry();
  const paletteCommands = [
    ...APP_SHORTCUT_IDS.filter((id) => id !== "commandPalette")
      .map((id) => ({ id, label: translate(shortcutDefinition(id).label), shortcut: shortcutTextOf(id, shortcutOverrides) ?? "", run: shortcutHandlers[id] })),
    ...openNoteCommands({
      note: activeNote, navigation, repository, dialogs, spaceId, moveToTrash, syncNow: vault.syncEngine ? syncNowFromPalette : null,
      onActionFailed: (error) => showToast({ message: describeError(error) }),
    }),
    // メモを 1 つだけ開いた別のウィンドウは、開いたときのスペースのままにする（スペースを切り替えない）。
    ...workspaceCommands({ repository, navigation, dialogs, spaces: isNoteWindow ? [] : spaces, currentSpaceId: spaceId }),
  ];
  // MCP の欄は PC 版（デスクトップのアプリ）にだけある。無い版では、パレットの設定の項目からも外す。
  const includesMcp = useContext(McpSectionSlot) !== null;
  return (
    <div className={`workspace${isNoteWindow ? " note-window" : ""}${isNoteWindow && navigation.openTabs.length <= 1 ? " single-note" : ""}${focusMode ? " focus-mode" : ""}${typewriterMode ? " typewriter-mode" : ""}${aiChat.open ? " with-ai-chat" : ""}`}>
      {focusMode && (
        <button type="button" className="zoom-back focus-mode-exit" aria-label={translate("workspace.exitFocusMode")} title={translate("workspace.exitFocusModeHint")}
          onClick={exitFocusMode}><ChevronLeft size={20} /><span>{translate("workspace.exitFocusMode")}</span></button>
      )}
      <Sidebar snapshot={snapshot} repository={repository} navigation={navigation} onCreateNote={() => void createNote()}
        onEnterFocusMode={() => setFocusMode(true)} onOpenGraph={() => navigation.openTab(GRAPH_TAB)} onOpenReminders={() => navigation.openTab(REMINDERS_TAB)}
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
        <div className="panes">
        <div className="pane">
        {navigation.activeTab === SETTINGS_TAB && (
          <SettingsPanel session={session} vault={vault} unreadableCount={snapshot.unreadableCount} isMobile={false}
            page={navigation.settingsPage} onSelectPage={navigation.selectSettingsPage} revealRequest={navigation.settingRevealRequest} />
        )}
        {activeNote && (
          <NoteLinkTargetsContext.Provider value={createNoteLinkTargets({ repository, navigation })}>
            <NoteQuerySourceContext.Provider value={{ summaries: snapshot.summaries, notebooks: snapshot.notebooks }}>
              <NoteEditor key={activeNote.id} note={activeNote} notebooks={snapshot.notebooks} backlinks={notesLinkingTo(snapshot.summaries, activeNote.id)}
              repository={repository} isMobile={false} onOpenInSplit={() => navigation.openInSplit(activeNote.id)}
              highlightedText={parseNoteSearchQuery(navigation.searchText).words.join(" ")} findRequest={navigation.findInNoteRequest} />
            </NoteQuerySourceContext.Provider>
          </NoteLinkTargetsContext.Provider>
        )}
        {databaseNotebook && (
          <NotebookDatabaseView notebook={databaseNotebook} repository={repository} onOpenNote={navigation.openNote}
            notes={snapshot.notes.filter((note) => note.content.notebookIds.includes(databaseNotebook.id) && note.content.trashedAt === null && !note.content.isTemplate)} />
        )}
        {showsGraph && <NoteGraphView summaries={snapshot.summaries} onOpenNote={navigation.openNote} />}
        {showsReminders && <RemindersView summaries={snapshot.summaries} repository={repository} onOpenNote={navigation.openNote} />}
        {!activeNote && !databaseNotebook && !showsGraph && !showsReminders && navigation.activeTab !== SETTINGS_TAB && (
          <EmptyEditorPane view={navigation.view} trashHasNotes={snapshot.notes.some((note) => note.content.trashedAt !== null)} onCreateNote={() => void createNote()} />
        )}
        </div>
        {splitNote && <SplitNotePane note={splitNote} snapshot={snapshot} repository={repository} navigation={navigation} />}
        </div>
      </main>
      {aiChat.open && (
        <AiChat isSidePanel repository={repository} notes={snapshot.notes.filter((note) => note.content.trashedAt === null)} onClose={() => aiChat.setOpen(false)}
          onOpenAiSettings={() => navigation.openSettings("ai")} onOpenNote={navigation.openNote} />
      )}
    </div>
  );
}

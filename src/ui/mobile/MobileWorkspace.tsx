// スマホの組み方: 一覧 → メモの画面。下のタブでメモ・ノートブック・お気に入り・設定を切り替える。

import { FileText, FolderOpen, Plus, Settings, Star } from "lucide-react";
import { useState } from "react";
import { notebookNameLookup, selectNotes, type NoteView } from "../../core/notes/noteQueries";
import { useDevicePreferences } from "../preferences/devicePreferences";
import { NoteEditor } from "../editor/NoteEditor";
import { createNoteLinkTargets, NoteLinkTargetsContext } from "../editor/noteLinkTargets";
import { translate } from "../i18n/translate";
import { SettingsPanel } from "../settings/SettingsPanel";
import { createNoteInView } from "../workspace/createNoteInView";
import { MobileLibrary } from "./MobileLibrary";
import { listTitle, NoteList } from "./MobileNoteList";
import { useBackGestureToClose } from "./useBackGestureToClose";
import { useSyncFromPull } from "./useSyncFromPull";
import { UpdateChip } from "../update/UpdateChip";
import { REMINDERS_TAB, SETTINGS_TAB } from "../workspace/useWorkspaceNavigation";
import { RemindersView } from "../workspace/RemindersView";
import type { WorkspaceProps } from "../workspace/workspaceProps";
import { findUnlinkedMentions } from "../../core/notes/noteMentions";
import { notesLinkingTo } from "../../core/notes/noteQueries";
import { NoteQuerySourceContext } from "../editor/noteQuerySource";
import { AiChat } from "../ai/AiChat";
import { useAiChatSession } from "../ai/aiChatSession";
import { ModalDialog } from "../shared/ModalDialog";
import { LockedNoteGate } from "../editor/LockedNoteGate";
import { useNoteLockState } from "../session/noteLockState";

type MobileTab = "notes" | "notebooks" | "bookmarked" | "settings";

export function MobileWorkspace({ session, vault, snapshot, navigation }: WorkspaceProps) {
  const { repository } = vault;
  const aiChat = useAiChatSession();
  const [tab, setTab] = useState<MobileTab>("notes");
  const { noteSortOrder } = useDevicePreferences();
  const syncFromPull = useSyncFromPull(session);
  // 開いているメモは PC の組み方と同じ所（navigation のタブ）に持つ。共有から作ったメモや、
  // メモ同士のリンクが、どちらの組み方でも同じ操作で開ける。
  const showsReminders = navigation.activeTab === REMINDERS_TAB;
  const openNoteId = navigation.activeTab !== SETTINGS_TAB && !showsReminders ? navigation.activeTab : null;
  const openNote = openNoteId ? repository.note(openNoteId) : undefined;
  // 「戻る」は 1 回で一覧へ戻す。リンクや共有で、開いたメモの上に別のメモを開いていても、全部閉じる
  // （戻るための履歴は、最初に開いたときの 1 つしか積んでいない）。
  const closeOpenNotes = () => navigation.openTabs.filter((tabId) => tabId !== SETTINGS_TAB && tabId !== REMINDERS_TAB).forEach(navigation.closeTab);
  const goBack = useBackGestureToClose(openNote !== undefined, closeOpenNotes);
  // 期限の一覧は、メモの上に重ねて開く画面。一覧からメモを開いて戻ると、また一覧に戻る。
  const closeReminders = useBackGestureToClose(showsReminders, () => navigation.closeTab(REMINDERS_TAB));
  // 設定のページを開いている間も、端末の「戻る」でページの一覧へ戻す。下のタブで別の画面へ移るときは、
  // 積んだ履歴をここで外す（残すと、次の「戻る」が 1 回空振りする）。
  const settingsPageOpen = openNote === undefined && tab === "settings" && navigation.settingsPage !== null;
  const closeSettingsPage = useBackGestureToClose(settingsPageOpen, () => navigation.selectSettingsPage(null));

  const { concealedNoteIds } = useNoteLockState();
  if (openNote && concealedNoteIds.has(openNote.id)) {
    return (
      <div className="phone">
        <LockedNoteGate key={openNote.id} title={openNote.content.title} verifyPassphrase={session.verifyPassphrase}
          onRevealed={() => navigation.revealLockedNote(openNote.id)} onBack={goBack} />
      </div>
    );
  }
  if (showsReminders) {
    return (
      <div className="phone">
        <RemindersView summaries={snapshot.summaries} repository={repository} onOpenNote={navigation.openNote} onBack={closeReminders} />
      </div>
    );
  }
  if (openNote) {
    return (
      <div className="phone">
        <NoteLinkTargetsContext.Provider value={createNoteLinkTargets({ repository, navigation, concealedNoteIds })}>
          <NoteQuerySourceContext.Provider value={{ summaries: snapshot.summaries, notebooks: snapshot.notebooks }}>
            <NoteEditor key={openNote.id} note={openNote} notebooks={snapshot.notebooks} backlinks={notesLinkingTo(snapshot.summaries, openNote.id)}
              unlinkedMentions={findUnlinkedMentions(snapshot.summaries, openNote)} repository={repository} isMobile onBack={goBack} />
            </NoteQuerySourceContext.Provider>
        </NoteLinkTargetsContext.Provider>
        {aiChat.open && (
          <ModalDialog label={translate("ai.chat")} className="ai-chat-dialog" onClose={() => aiChat.setOpen(false)}>
            <AiChat repository={repository} notes={snapshot.notes.filter((note) => note.content.trashedAt === null && !concealedNoteIds.has(note.id))} onClose={() => aiChat.setOpen(false)} />
          </ModalDialog>
        )}
      </div>
    );
  }

  const view: NoteView = tab === "bookmarked" ? { kind: "bookmarked" } : navigation.view;
  const createNote = async () => navigation.openNote((await createNoteInView(repository, view)).id);
  const selectTab = (next: MobileTab) => {
    if (settingsPageOpen) {
      closeSettingsPage();
    }
    setTab(next);
    // 下の「設定」を押したら、いつもページの一覧から始める。
    if (next === "settings") {
      navigation.selectSettingsPage(null);
    }
    if (next === "notes") {
      navigation.selectView({ kind: "all" });
    }
  };

  return (
    <div className="phone">
      {tab === "settings" && (
        <SettingsPanel session={session} vault={vault} unreadableCount={snapshot.unreadableCount} isMobile
          page={navigation.settingsPage} onSelectPage={navigation.selectSettingsPage} onBackToPageList={closeSettingsPage} />
      )}
      {tab === "notebooks" && (
        <MobileLibrary snapshot={snapshot} repository={repository}
          onPick={(picked) => { navigation.selectView(picked); setTab("notes"); }} onOpenReminders={() => navigation.openTab(REMINDERS_TAB)} />
      )}
      {tab !== "settings" && <UpdateChip onOpenSettings={() => { selectTab("settings"); navigation.selectSettingsPage("update"); }} />}
      {(tab === "notes" || tab === "bookmarked") && (
        <NoteList title={listTitle(view, snapshot.notebooks)} summaries={selectNotes(snapshot.summaries, { view, searchText: navigation.searchText, sortOrder: noteSortOrder, notebookNameOf: notebookNameLookup(snapshot.notebooks) })}
          notebooks={snapshot.notebooks.map((notebook) => ({ id: notebook.id, name: notebook.content.name }))}
          view={view} showChips={tab === "notes"} navigation={navigation} repository={repository} onOpen={navigation.openNote}
          onPullToSync={syncFromPull} />
      )}
      {(tab === "notes" || tab === "bookmarked") && (
        <button className="fab" aria-label={translate("sidebar.newNote")} onClick={() => void createNote()}><Plus size={26} /></button>
      )}
      <nav className="tabbar">
        <button className={tab === "notes" ? "on" : ""} onClick={() => selectTab("notes")}><FileText size={18} />{translate("mobile.notes")}</button>
        <button className={tab === "notebooks" ? "on" : ""} onClick={() => selectTab("notebooks")}><FolderOpen size={18} />{translate("mobile.notebooks")}</button>
        <button className={tab === "bookmarked" ? "on" : ""} onClick={() => selectTab("bookmarked")}><Star size={18} />{translate("mobile.bookmarked")}</button>
        <button className={tab === "settings" ? "on" : ""} onClick={() => selectTab("settings")}><Settings size={18} />{translate("mobile.settings")}</button>
      </nav>
    </div>
  );
}

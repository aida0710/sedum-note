// スマホの組み方: 一覧 → メモの画面。下のタブでメモ・ノートブック・お気に入り・設定を切り替える。

import { FileText, FolderOpen, Plus, Settings, Star } from "lucide-react";
import { useState } from "react";
import { notebookNameLookup, selectNotes, type NoteView } from "../../core/notes/noteQueries";
import type { LiveSavedSearch } from "../../core/notes/noteRecords";
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
import type { SettingsPage } from "../settings/settingsPages";
import { SyncStatusLine } from "../workspace/SyncStatusLine";
import { REMINDERS_TAB, SETTINGS_TAB, viewKey } from "../workspace/useWorkspaceNavigation";
import { RemindersView } from "../workspace/RemindersView";
import type { WorkspaceProps } from "../workspace/workspaceProps";
import { findUnlinkedMentions } from "../../core/notes/noteMentions";
import { notesLinkingTo } from "../../core/notes/noteQueries";
import { NoteQuerySourceContext } from "../editor/noteQuerySource";
import { AiChat } from "../ai/AiChat";
import { useAiChatSession } from "../ai/aiChatSession";
import { ModalDialog } from "../shared/ModalDialog";

type MobileTab = "notes" | "notebooks" | "bookmarked" | "settings";

// 消えたノートブックを指している一覧は、開いていないものとして扱う（ほかのデバイスや「…」のメニューで削除されたとき）。
function existingView(view: NoteView | null, notebooks: WorkspaceProps["snapshot"]["notebooks"]): NoteView | null {
  if (view?.kind === "notebook" && !notebooks.some((notebook) => notebook.id === view.notebookId)) {
    return null;
  }
  return view;
}

export function MobileWorkspace({ session, vault, snapshot, navigation }: Omit<WorkspaceProps, "isNoteWindow">) {
  const { repository } = vault;
  const aiChat = useAiChatSession();
  const [tab, setTab] = useState<MobileTab>("notes");
  // 「ノートブック」タブで開いている一覧（ノートブック・タグ・テンプレート・ゴミ箱）。null ならノートブックの一覧を出す。
  const [pickedLibraryView, setPickedLibraryView] = useState<NoteView | null>(null);
  const libraryView = existingView(pickedLibraryView, snapshot.notebooks);
  // ノートブックかタグの一覧の中を検索しているときに、「すべてのメモ」へ広げているか。
  const [searchesEverywhere, setSearchesEverywhere] = useState(false);
  const { noteSortOrder, typewriterMode } = useDevicePreferences();
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
  // 「ノートブック」タブで一覧を開いている間は、端末の「戻る」でノートブックの一覧へ戻す。
  const libraryListOpen = openNote === undefined && !showsReminders && tab === "notebooks" && libraryView !== null;
  const closeLibraryList = useBackGestureToClose(libraryListOpen, () => setPickedLibraryView(null));
  // 設定のページへ移る。メモを開いていれば「戻る」と同じく閉じる（積んだ履歴も外す）。
  const openSettingsPage = (page: SettingsPage) => {
    setTab("settings");
    navigation.selectSettingsPage(page);
    if (openNote) {
      goBack();
    }
  };
  const openAiSettings = () => {
    aiChat.setOpen(false);
    openSettingsPage("ai");
  };
  const syncFromPull = useSyncFromPull({ session, onOpenSyncSettings: () => openSettingsPage("sync") });

  if (showsReminders) {
    return (
      <div className="phone">
        <RemindersView summaries={snapshot.summaries} repository={repository} onOpenNote={navigation.openNote} onBack={closeReminders} />
      </div>
    );
  }
  if (openNote) {
    return (
      <div className={`phone${typewriterMode ? " typewriter-mode" : ""}`}>
        <NoteLinkTargetsContext.Provider value={createNoteLinkTargets({ repository, navigation })}>
          <NoteQuerySourceContext.Provider value={{ summaries: snapshot.summaries, notebooks: snapshot.notebooks }}>
            <NoteEditor key={openNote.id} note={openNote} notebooks={snapshot.notebooks} backlinks={notesLinkingTo(snapshot.summaries, openNote.id)}
              unlinkedMentions={findUnlinkedMentions(snapshot.summaries, openNote)} repository={repository} isMobile onBack={goBack} />
            </NoteQuerySourceContext.Provider>
        </NoteLinkTargetsContext.Provider>
        {aiChat.open && (
          <ModalDialog label={translate("ai.chat")} className="ai-chat-dialog" onClose={() => aiChat.setOpen(false)}>
            <AiChat repository={repository} notes={snapshot.notes.filter((note) => note.content.trashedAt === null)} onClose={() => aiChat.setOpen(false)}
              onOpenAiSettings={openAiSettings} onOpenNote={(noteId) => {
                // スマホでは、チャットのダイアログを閉じてメモを開く（チャットは裏で続く）。
                aiChat.setOpen(false);
                navigation.openNote(noteId);
              }} />
          </ModalDialog>
        )}
      </div>
    );
  }

  const selectTab = (next: MobileTab) => {
    if (settingsPageOpen) {
      closeSettingsPage();
    }
    if (libraryListOpen) {
      closeLibraryList();
    }
    setTab(next);
    // 下の「設定」を押したら、いつもページの一覧から始める。
    if (next === "settings") {
      navigation.selectSettingsPage(null);
    }
    if (next === "notes") {
      navigation.selectView({ kind: "all" });
    }
    // 下の「ノートブック」を押したら、いつもノートブックの一覧から始める。
    if (next === "notebooks") {
      setPickedLibraryView(null);
    }
  };
  const listViews: Record<Exclude<MobileTab, "settings">, NoteView | null> = {
    notes: existingView(navigation.view, snapshot.notebooks) ?? { kind: "all" },
    notebooks: libraryView,
    bookmarked: { kind: "bookmarked" },
  };
  // 今のタブで出しているメモの一覧。設定と、ノートブックの一覧を出しているときは null。
  const view = tab === "settings" ? null : listViews[tab];
  const isScopedSearch = (view?.kind === "notebook" || view?.kind === "tag") && navigation.searchText.trim() !== "";
  const searchedView: NoteView | null = isScopedSearch && searchesEverywhere ? { kind: "all" } : view;
  // 保存した検索を開く。範囲（ノートブックかタグ）があればその一覧で、無ければ「メモ」タブのすべてのメモで探す。
  const openSavedSearch = ({ content }: LiveSavedSearch) => {
    const scope: NoteView | null = content.notebookId !== null ? { kind: "notebook", notebookId: content.notebookId } : content.tag !== null ? { kind: "tag", tag: content.tag } : null;
    if (scope) {
      setPickedLibraryView(scope);
    } else {
      selectTab("notes");
    }
    setSearchesEverywhere(false);
    navigation.setSearchText(content.searchText);
  };
  const createNote = async (inView: NoteView) => navigation.openNote((await createNoteInView(repository, inView)).id);

  return (
    <div className="phone">
      {tab === "settings" && (
        <SettingsPanel session={session} vault={vault} unreadableCount={snapshot.unreadableCount} isMobile
          page={navigation.settingsPage} onSelectPage={navigation.selectSettingsPage} onBackToPageList={closeSettingsPage} />
      )}
      {tab === "notebooks" && view === null && (
        <MobileLibrary snapshot={snapshot} repository={repository}
          onPick={setPickedLibraryView} onOpenSavedSearch={openSavedSearch} onOpenNote={navigation.openNote} onOpenReminders={() => navigation.openTab(REMINDERS_TAB)} />
      )}
      {tab !== "settings" && <UpdateChip onOpenSettings={() => openSettingsPage("update")} />}
      {view && searchedView && (
        <NoteList title={listTitle(view, snapshot.notebooks)} summaries={selectNotes(snapshot.summaries, { view: searchedView, searchText: navigation.searchText, sortOrder: noteSortOrder, notebookNameOf: notebookNameLookup(snapshot.notebooks) })}
          notebooks={snapshot.notebooks} view={view} listKey={`${tab}:${viewKey(view)}`} showChips={tab === "notes"}
          headerEnd={<SyncStatusLine status={session.syncStatus} onOpenSyncSettings={() => openSettingsPage("sync")} />}
          searchScope={isScopedSearch ? { searchesEverywhere, onChange: setSearchesEverywhere } : null}
          onBackToLibrary={tab === "notebooks" ? closeLibraryList : undefined}
          navigation={navigation} repository={repository} onOpen={navigation.openNote} onPullToSync={syncFromPull} />
      )}
      {/* ゴミ箱の中には新しいメモを作れないので、「＋」を出さない。 */}
      {view && view.kind !== "trash" && (
        <button className="fab" aria-label={translate("sidebar.newNote")} onClick={() => void createNote(view)}><Plus size={26} /></button>
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

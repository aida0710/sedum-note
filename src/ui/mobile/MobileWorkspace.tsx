// スマホの組み方: 一覧 → メモの画面。下のタブでメモ・ノートブック・お気に入り・設定を切り替える。

import { FileText, FolderOpen, Plus, Settings, Star } from "lucide-react";
import { useState } from "react";
import { selectNotes, type NoteView } from "../../core/notes/noteQueries";
import { useDevicePreferences } from "../preferences/devicePreferences";
import { NoteEditor } from "../editor/NoteEditor";
import { createNoteLinkTargets, NoteLinkTargetsContext } from "../editor/noteLinkTargets";
import { translate } from "../i18n/translate";
import { SettingsPanel } from "../settings/SettingsPanel";
import { createNoteInView } from "../workspace/createNoteInView";
import { MobileLibrary } from "./MobileLibrary";
import { listTitle, NoteList } from "./MobileNoteList";
import { useBackGestureToClose } from "./useBackGestureToClose";
import { UpdateChip } from "../update/UpdateChip";
import { SETTINGS_TAB } from "../workspace/useWorkspaceNavigation";
import type { WorkspaceProps } from "../workspace/workspaceProps";

type MobileTab = "notes" | "notebooks" | "bookmarked" | "settings";

export function MobileWorkspace({ session, vault, snapshot, navigation }: WorkspaceProps) {
  const { repository } = vault;
  const [tab, setTab] = useState<MobileTab>("notes");
  const { noteSortOrder } = useDevicePreferences();
  // 開いているメモは PC の組み方と同じ所（navigation のタブ）に持つ。共有から作ったメモや、
  // メモ同士のリンクが、どちらの組み方でも同じ操作で開ける。
  const openNoteId = navigation.activeTab !== SETTINGS_TAB ? navigation.activeTab : null;
  const openNote = openNoteId ? repository.note(openNoteId) : undefined;
  // 「戻る」は 1 回で一覧へ戻す。リンクや共有で、開いたメモの上に別のメモを開いていても、全部閉じる
  // （戻るための履歴は、最初に開いたときの 1 つしか積んでいない）。
  const closeOpenNotes = () => navigation.openTabs.filter((tabId) => tabId !== SETTINGS_TAB).forEach(navigation.closeTab);
  const goBack = useBackGestureToClose(openNote !== undefined, closeOpenNotes);

  if (openNote) {
    return (
      <div className="phone">
        <NoteLinkTargetsContext.Provider value={createNoteLinkTargets(repository, navigation.openNote)}>
          <NoteEditor key={openNote.id} note={openNote} notebooks={snapshot.notebooks} repository={repository} isMobile onBack={goBack} />
        </NoteLinkTargetsContext.Provider>
      </div>
    );
  }

  const view: NoteView = tab === "bookmarked" ? { kind: "bookmarked" } : navigation.view;
  const createNote = async () => navigation.openNote((await createNoteInView(repository, view)).id);
  const selectTab = (next: MobileTab) => {
    setTab(next);
    if (next === "notes") {
      navigation.selectView({ kind: "all" });
    }
  };

  return (
    <div className="phone">
      {tab === "settings" && <SettingsPanel session={session} repository={repository} remoteConfig={vault.remoteConfig} unreadableCount={snapshot.unreadableCount} isMobile />}
      {tab === "notebooks" && (
        <MobileLibrary snapshot={snapshot} repository={repository}
          onPick={(picked) => { navigation.selectView(picked); setTab("notes"); }} />
      )}
      {tab !== "settings" && <UpdateChip onOpenSettings={() => selectTab("settings")} />}
      {(tab === "notes" || tab === "bookmarked") && (
        <NoteList title={listTitle(view, snapshot.notebooks)} summaries={selectNotes(snapshot.summaries, { view, searchText: navigation.searchText, sortOrder: noteSortOrder })}
          notebooks={snapshot.notebooks.map((notebook) => ({ id: notebook.id, name: notebook.content.name }))}
          view={view} showChips={tab === "notes"} navigation={navigation} onOpen={navigation.openNote} />
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

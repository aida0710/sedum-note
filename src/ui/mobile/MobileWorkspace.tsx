// スマホの組み方: 一覧 → メモの画面。下のタブでメモ・ノートブック・お気に入り・設定を切り替える。

import { FileText, FolderOpen, Plus, Settings, Star } from "lucide-react";
import { useState } from "react";
import { selectNotes, type NoteView } from "../../core/notes/noteQueries";
import { useDevicePreferences } from "../preferences/devicePreferences";
import { NoteEditor } from "../editor/NoteEditor";
import { translate } from "../i18n/translate";
import { SettingsPanel } from "../settings/SettingsPanel";
import { createNoteInView } from "../workspace/createNoteInView";
import { MobileLibrary } from "./MobileLibrary";
import { listTitle, NoteList } from "./MobileNoteList";
import { useBackGestureToClose } from "./useBackGestureToClose";
import type { WorkspaceProps } from "../workspace/workspaceProps";

type MobileTab = "notes" | "notebooks" | "bookmarked" | "settings";

export function MobileWorkspace({ session, vault, snapshot, navigation }: WorkspaceProps) {
  const { repository } = vault;
  const [tab, setTab] = useState<MobileTab>("notes");
  const { noteSortOrder } = useDevicePreferences();
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const openNote = openNoteId ? repository.note(openNoteId) : undefined;
  const goBack = useBackGestureToClose(openNote !== undefined, () => setOpenNoteId(null));

  if (openNote) {
    return (
      <div className="phone">
        <NoteEditor key={openNote.id} note={openNote} notebooks={snapshot.notebooks} repository={repository}
          syncConfigured={vault.remoteConfig !== null} isMobile onBack={goBack} />
      </div>
    );
  }

  const view: NoteView = tab === "bookmarked" ? { kind: "bookmarked" } : navigation.view;
  const createNote = async () => setOpenNoteId((await createNoteInView(repository, view)).id);
  const selectTab = (next: MobileTab) => {
    setTab(next);
    if (next === "notes") {
      navigation.selectView({ kind: "all" });
    }
  };

  return (
    <div className="phone">
      {tab === "settings" && <SettingsPanel session={session} remoteConfig={vault.remoteConfig} unreadableCount={snapshot.unreadableCount} />}
      {tab === "notebooks" && (
        <MobileLibrary snapshot={snapshot} repository={repository}
          onPick={(picked) => { navigation.selectView(picked); setTab("notes"); }} />
      )}
      {(tab === "notes" || tab === "bookmarked") && (
        <NoteList title={listTitle(view, snapshot.notebooks)} summaries={selectNotes(snapshot.summaries, { view, searchText: navigation.searchText, sortOrder: noteSortOrder })}
          notebooks={snapshot.notebooks.map((notebook) => ({ id: notebook.id, name: notebook.content.name }))}
          view={view} showChips={tab === "notes"} navigation={navigation} onOpen={setOpenNoteId} />
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

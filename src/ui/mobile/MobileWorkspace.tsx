// スマホの組み方: 一覧 → メモの画面。下のタブでメモ・ノートブック・お気に入り・設定を切り替える。

import { FileText, FolderOpen, Pin, Plus, Search, Settings, Star } from "lucide-react";
import { useState } from "react";
import { selectNotes, type NoteSummary, type NoteView } from "../../core/notes/noteQueries";
import { useAttachmentUrl } from "../editor/attachmentReader";
import { NoteEditor } from "../editor/NoteEditor";
import { translate } from "../i18n/translate";
import { SettingsPanel } from "../settings/SettingsPanel";
import { formatShortDate } from "../shared/formatTime";
import { createNoteInView } from "../workspace/useNoteCreation";
import type { WorkspaceProps } from "../workspace/workspaceProps";

type MobileTab = "notes" | "notebooks" | "bookmarked" | "settings";

export function MobileWorkspace({ session, vault, snapshot, navigation }: WorkspaceProps) {
  const { repository } = vault;
  const [tab, setTab] = useState<MobileTab>("notes");
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const openNote = openNoteId ? repository.note(openNoteId) : undefined;

  if (openNote) {
    return (
      <div className="phone">
        <NoteEditor key={openNote.id} note={openNote} notebooks={snapshot.notebooks} repository={repository}
          syncConfigured={vault.remoteConfig !== null} isMobile onBack={() => setOpenNoteId(null)} />
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
        <NotebookPicker snapshot={snapshot.notebooks.map((notebook) => ({ id: notebook.id, name: notebook.content.name }))}
          onPick={(notebookId) => { navigation.selectView({ kind: "notebook", notebookId }); setTab("notes"); }} />
      )}
      {(tab === "notes" || tab === "bookmarked") && (
        <NoteList title={listTitle(view, snapshot.notebooks)} summaries={selectNotes(snapshot.summaries, view, navigation.searchText)}
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

function listTitle(view: NoteView, notebooks: WorkspaceProps["snapshot"]["notebooks"]): string {
  if (view.kind === "notebook") {
    return notebooks.find((notebook) => notebook.id === view.notebookId)?.content.name ?? translate("sidebar.allNotes");
  }
  return translate(view.kind === "bookmarked" ? "sidebar.bookmarked" : view.kind === "trash" ? "sidebar.trash" : "sidebar.allNotes");
}

type NotebookChoice = { id: string; name: string };

type NoteListProps = {
  title: string;
  summaries: NoteSummary[];
  notebooks: NotebookChoice[];
  view: NoteView;
  showChips: boolean;
  navigation: WorkspaceProps["navigation"];
  onOpen: (noteId: string) => void;
};

function NoteList({ title, summaries, notebooks, view, showChips, navigation, onOpen }: NoteListProps) {
  return (
    <>
      <div className="phone-top"><h2>{title}</h2></div>
      <label className="phone-search">
        <Search size={15} />
        <input value={navigation.searchText} placeholder={translate("sidebar.searchPlaceholder")} onChange={(event) => navigation.setSearchText(event.target.value)} />
      </label>
      {showChips && (
        <div className="chips">
          <button className={`chip${view.kind === "all" ? " on" : ""}`} onClick={() => navigation.selectView({ kind: "all" })}>{translate("mobile.all")}</button>
          {notebooks.map((notebook) => (
            <button key={notebook.id} className={`chip${view.kind === "notebook" && view.notebookId === notebook.id ? " on" : ""}`}
              onClick={() => navigation.selectView({ kind: "notebook", notebookId: notebook.id })}>{notebook.name}</button>
          ))}
        </div>
      )}
      <div className="phone-scroll">
        {summaries.length === 0 && <div className="empty-state">{translate("sidebar.noNotes")}</div>}
        {summaries.map((summary) => <NoteListItem key={summary.note.id} summary={summary} notebooks={notebooks} onOpen={onOpen} />)}
      </div>
    </>
  );
}

function NoteListItem({ summary, notebooks, onOpen }: { summary: NoteSummary; notebooks: NotebookChoice[]; onOpen: (noteId: string) => void }) {
  const { note, plainText } = summary;
  const firstImage = note.content.attachments.find((attachment) => attachment.mimeType.startsWith("image/")) ?? null;
  const thumbnail = useAttachmentUrl(firstImage?.id ?? null, firstImage?.mimeType);
  const notebookNames = notebooks.filter((notebook) => note.content.notebookIds.includes(notebook.id)).map((notebook) => notebook.name);
  return (
    <button className="note-item" onClick={() => onOpen(note.id)}>
      <h3>{note.content.pinned && <Pin size={13} className="pin" />}{note.content.title || translate("sidebar.untitled")}</h3>
      {firstImage && thumbnail.state === "ready" && <img className="thumb" src={thumbnail.url} alt="" />}
      <p>{plainText}</p>
      <span className="meta">{[formatShortDate(note.updatedAt), ...notebookNames].join(" · ")}</span>
    </button>
  );
}

function NotebookPicker({ snapshot, onPick }: { snapshot: NotebookChoice[]; onPick: (notebookId: string) => void }) {
  return (
    <>
      <div className="phone-top"><h2>{translate("mobile.notebooks")}</h2></div>
      <div className="phone-scroll">
        {snapshot.map((notebook) => (
          <button key={notebook.id} className="note-item" onClick={() => onPick(notebook.id)}><h3>{notebook.name}</h3></button>
        ))}
      </div>
    </>
  );
}

// スマホのメモの一覧（検索・ノートブックの切り替え・要約とサムネイル）。

import { Pin, Search } from "lucide-react";
import { useContext } from "react";
import type { NoteSummary, NoteView } from "../../core/notes/noteQueries";
import { useAttachmentUrl } from "../editor/attachmentReader";
import { translate } from "../i18n/translate";
import { UnsyncedRecordsContext } from "../session/useRepositorySnapshot";
import { formatShortDate } from "../shared/formatTime";
import type { WorkspaceProps } from "../workspace/workspaceProps";

export function listTitle(view: NoteView, notebooks: WorkspaceProps["snapshot"]["notebooks"]): string {
  if (view.kind === "notebook") {
    return notebooks.find((notebook) => notebook.id === view.notebookId)?.content.name ?? translate("sidebar.allNotes");
  }
  if (view.kind === "tag") {
    return `#${view.tag}`;
  }
  const titles = { bookmarked: "sidebar.bookmarked", trash: "sidebar.trash", templates: "sidebar.templates", all: "sidebar.allNotes" } as const;
  return translate(titles[view.kind]);
}

export type NotebookChoice = { id: string; name: string };

type NoteListProps = {
  title: string;
  summaries: NoteSummary[];
  notebooks: NotebookChoice[];
  view: NoteView;
  showChips: boolean;
  navigation: WorkspaceProps["navigation"];
  onOpen: (noteId: string) => void;
};

export function NoteList({ title, summaries, notebooks, view, showChips, navigation, onOpen }: NoteListProps) {
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
  const unsyncedIds = useContext(UnsyncedRecordsContext);
  const firstImage = note.content.attachments.find((attachment) => attachment.mimeType.startsWith("image/")) ?? null;
  const thumbnail = useAttachmentUrl(firstImage?.id ?? null, firstImage?.mimeType);
  const notebookNames = notebooks.filter((notebook) => note.content.notebookIds.includes(notebook.id)).map((notebook) => notebook.name);
  return (
    <button className="note-item" onClick={() => onOpen(note.id)}>
      <h3>{unsyncedIds.has(note.id) && <span className="unsynced-dot" title={translate("editor.unsynced")} />}{note.content.pinned && <Pin size={13} className="pin" />}{note.content.title || translate("sidebar.untitled")}</h3>
      {firstImage && thumbnail.state === "ready" && <img className="thumb" src={thumbnail.url} alt="" />}
      <p>{plainText}</p>
      <span className="meta">{[formatShortDate(note.updatedAt), ...notebookNames].join(" · ")}</span>
    </button>
  );
}

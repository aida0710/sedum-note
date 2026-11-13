import { AlarmClock, Bookmark, FolderPlus, Hash, Trash2, LayoutTemplate } from "lucide-react";
import { dueItemsOf } from "../../core/notes/dueItems";
import { countTags, type NoteView, selectNotes } from "../../core/notes/noteQueries";
import type { LiveSavedSearch } from "../../core/notes/noteRecords";
import { translate } from "../i18n/translate";
import { useDialogs } from "../shared/DialogProvider";
import { notebookTreeRows } from "../editor/notebookTreeRows";
import { assignNotebookColors } from "../shared/notebookAppearance";
import { MobileNotebookRow } from "./MobileNotebookRow";
import type { WorkspaceProps } from "../workspace/workspaceProps";

type MobileLibraryProps = {
  snapshot: WorkspaceProps["snapshot"];
  repository: WorkspaceProps["vault"]["repository"];
  onPick: (view: NoteView) => void;
  onOpenSavedSearch: (savedSearch: LiveSavedSearch) => void;
  onOpenNote: (noteId: string) => void;
  onOpenReminders: () => void;
};

// スマホの「ノートブック」タブ: ノートブック・タグ・ゴミ箱を選ぶと、その一覧を開く。期限の一覧もここから開く。
// ノートブックは、PC の左の列と同じ順（親の下に子、同じ階層は名前の順）で、子を字下げして並べる。
export function MobileLibrary({ snapshot, repository, onPick, onOpenSavedSearch, onOpenNote, onOpenReminders }: MobileLibraryProps) {
  const dialogs = useDialogs();
  const tags = countTags(snapshot.summaries);
  const notebookColors = assignNotebookColors(snapshot.notebooks);
  const addNotebook = async () => {
    const name = (await dialogs.prompt({ message: translate("sidebar.newNotebookPlaceholder"), confirmLabel: translate("common.create") }))?.trim();
    if (name) {
      await repository.createNotebook(name);
    }
  };
  return (
    <>
      <div className="phone-top">
        <h2>{translate("mobile.notebooks")}</h2>
        <div className="phone-top-end">
          <button className="icon-button" aria-label={translate("sidebar.newNotebook")} onClick={() => void addNotebook()}><FolderPlus size={18} /></button>
        </div>
      </div>
      <div className="phone-scroll">
        {notebookTreeRows(snapshot.notebooks, "").map(({ notebook, depth }) => (
          <MobileNotebookRow key={notebook.id} notebook={notebook} depth={depth} notebookColors={notebookColors} repository={repository}
            noteCount={selectNotes(snapshot.summaries, { view: { kind: "notebook", notebookId: notebook.id } }).length}
            onOpen={() => onPick({ kind: "notebook", notebookId: notebook.id })} onOpenNote={onOpenNote} />
        ))}
        {tags.length > 0 && <div className="section-title">{translate("sidebar.tags")}</div>}
        {tags.map(({ tag, count }) => (
          <button key={tag} className="library-row" onClick={() => onPick({ kind: "tag", tag })}>
            <Hash size={15} /><span className="library-row-label">{tag}</span><span className="count">{count}</span>
          </button>
        ))}
        {/* PC で保存した検索も、ここから開ける（保存と削除は PC の左の列で行う）。 */}
        {snapshot.savedSearches.length > 0 && <div className="section-title">{translate("sidebar.savedSearches")}</div>}
        {snapshot.savedSearches.map((savedSearch) => (
          <button key={savedSearch.id} className="library-row" onClick={() => onOpenSavedSearch(savedSearch)}>
            <Bookmark size={15} /><span className="library-row-label">{savedSearch.content.name}</span>
          </button>
        ))}
        <div className="section-title" />
        <button className="library-row" onClick={onOpenReminders}>
          <AlarmClock size={15} />{translate("due.title")}
          <span className="count">{dueItemsOf(snapshot.summaries).filter((item) => !item.done).length}</span>
        </button>
        <button className="library-row" onClick={() => onPick({ kind: "templates" })}>
          <LayoutTemplate size={15} />{translate("sidebar.templates")}
          <span className="count">{selectNotes(snapshot.summaries, { view: { kind: "templates" } }).length}</span>
        </button>
        <button className="library-row" onClick={() => onPick({ kind: "trash" })}>
          <Trash2 size={15} />{translate("sidebar.trash")}
          <span className="count">{selectNotes(snapshot.summaries, { view: { kind: "trash" } }).length}</span>
        </button>
      </div>
    </>
  );
}

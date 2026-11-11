import { FolderPlus, Hash, Trash2 } from "lucide-react";
import { countTags, type NoteView, selectNotes } from "../../core/notes/noteQueries";
import { translate } from "../i18n/translate";
import { useDialogs } from "../shared/DialogProvider";
import { assignNotebookColors, NotebookMark } from "../shared/notebookAppearance";
import type { WorkspaceProps } from "../workspace/workspaceProps";

type MobileLibraryProps = {
  snapshot: WorkspaceProps["snapshot"];
  repository: WorkspaceProps["vault"]["repository"];
  onPick: (view: NoteView) => void;
};

// スマホの「ノートブック」タブ: ノートブック・タグ・ゴミ箱を選ぶと、その一覧を開く。
export function MobileLibrary({ snapshot, repository, onPick }: MobileLibraryProps) {
  const dialogs = useDialogs();
  const tags = countTags(snapshot.summaries);
  const notebookColors = assignNotebookColors(snapshot.notebooks);
  const addNotebook = async () => {
    const name = (await dialogs.prompt({ message: translate("sidebar.newNotebookPlaceholder") }))?.trim();
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
        {snapshot.notebooks.map((notebook) => (
          <button key={notebook.id} className="library-row" onClick={() => onPick({ kind: "notebook", notebookId: notebook.id })}>
            <NotebookMark notebook={notebook} colors={notebookColors} />{notebook.content.name}
            <span className="count">{selectNotes(snapshot.summaries, { view: { kind: "notebook", notebookId: notebook.id } }).length}</span>
          </button>
        ))}
        {tags.length > 0 && <div className="section-title">{translate("sidebar.tags")}</div>}
        {tags.map(({ tag, count }) => (
          <button key={tag} className="library-row" onClick={() => onPick({ kind: "tag", tag })}>
            <Hash size={15} />{tag}<span className="count">{count}</span>
          </button>
        ))}
        <div className="section-title" />
        <button className="library-row" onClick={() => onPick({ kind: "trash" })}>
          <Trash2 size={15} />{translate("sidebar.trash")}
          <span className="count">{selectNotes(snapshot.summaries, { view: { kind: "trash" } }).length}</span>
        </button>
      </div>
    </>
  );
}

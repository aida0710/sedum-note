import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import type { LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { PopupMenu } from "../shared/PopupMenu";

type NotebookActionsMenuProps = {
  anchor: HTMLElement;
  notebook: LiveNotebook;
  repository: NoteRepository;
  onClose: () => void;
  onRename: () => void;
  onAddChild: () => void;
};

export function NotebookActionsMenu({ anchor, notebook, repository, onClose, onRename, onAddChild }: NotebookActionsMenuProps) {
  const choose = (action: () => void) => () => {
    onClose();
    action();
  };
  const remove = () => {
    if (window.confirm(translate("notebook.removeConfirm", { name: notebook.content.name }))) {
      void repository.removeNotebook(notebook.id);
    }
  };
  return (
    <PopupMenu anchor={anchor} onClose={onClose}>
      <button className="menu-item" role="menuitem" onClick={choose(onRename)}><Pencil size={15} />{translate("notebook.rename")}</button>
      <button className="menu-item" role="menuitem" onClick={choose(onAddChild)}><FolderPlus size={15} />{translate("notebook.addChild")}</button>
      <div className="menu-separator" />
      <button className="menu-item danger" role="menuitem" onClick={choose(remove)}><Trash2 size={15} />{translate("notebook.remove")}</button>
    </PopupMenu>
  );
}

import { FolderPlus, ListPlus, Palette, Pencil, Table, Trash2 } from "lucide-react";
import type { LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { useDialogs } from "../shared/DialogProvider";
import { PopupMenu } from "../shared/PopupMenu";

type NotebookActionsMenuProps = {
  anchor: HTMLElement;
  notebook: LiveNotebook;
  repository: NoteRepository;
  onClose: () => void;
  onRename: () => void;
  onChooseAppearance: () => void;
  onEditProperties: () => void;
  // データベース表示を開く。開けない画面（スマホ）では渡さない。
  onOpenDatabase?: () => void;
  onAddChild: () => void;
};

export function NotebookActionsMenu({ anchor, notebook, repository, onClose, onRename, onChooseAppearance, onEditProperties, onOpenDatabase, onAddChild }: NotebookActionsMenuProps) {
  const dialogs = useDialogs();
  const choose = (action: () => void) => () => {
    onClose();
    action();
  };
  const remove = async () => {
    const accepted = await dialogs.confirm({
      message: translate("notebook.removeConfirm", { name: notebook.content.name }), confirmLabel: translate("common.delete"), danger: true,
    });
    if (accepted) {
      await repository.removeNotebook(notebook.id);
    }
  };
  return (
    <PopupMenu anchor={anchor} onClose={onClose}>
      <button className="menu-item" role="menuitem" onClick={choose(onRename)}><Pencil size={15} />{translate("notebook.rename")}</button>
      <button className="menu-item" role="menuitem" onClick={choose(onChooseAppearance)}><Palette size={15} />{translate("notebook.appearance")}</button>
      {onOpenDatabase && <button className="menu-item" role="menuitem" onClick={choose(onOpenDatabase)}><Table size={15} />{translate("database.open")}</button>}
      <button className="menu-item" role="menuitem" onClick={choose(onEditProperties)}><ListPlus size={15} />{translate("property.dialogTitle")}</button>
      <button className="menu-item" role="menuitem" onClick={choose(onAddChild)}><FolderPlus size={15} />{translate("notebook.addChild")}</button>
      <div className="menu-separator" />
      <button className="menu-item danger" role="menuitem" onClick={choose(() => void remove())}><Trash2 size={15} />{translate("notebook.remove")}</button>
    </PopupMenu>
  );
}

import { FilePlus, FolderInput, FolderPlus, ListPlus, Palette, Pencil, Table, Trash2 } from "lucide-react";
import type { LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { useDialogs } from "../shared/DialogProvider";
import { PopupMenu } from "../shared/PopupMenu";
import { ICON_SIZE } from "../shared/iconSizes";

type NotebookActionsMenuProps = {
  anchor: HTMLElement;
  notebook: LiveNotebook;
  repository: NoteRepository;
  onClose: () => void;
  onRename: () => void;
  // 移し先を選ぶダイアログ（MoveNotebookDialog）を開く。
  onMove: () => void;
  onChooseAppearance: () => void;
  onEditProperties: () => void;
  // データベース表示を開く。開けない画面（スマホ）では渡さない。
  onOpenDatabase?: () => void;
  // 中に新しいメモを作る。
  onAddNote: () => void;
  onAddChild: () => void;
};

export function NotebookActionsMenu({ anchor, notebook, repository, onClose, onRename, onMove, onChooseAppearance, onEditProperties, onOpenDatabase, onAddNote, onAddChild }: NotebookActionsMenuProps) {
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
      {/* 中に作るものを、先にまとめる。 */}
      <button className="menu-item" role="menuitem" onClick={choose(onAddNote)}><FilePlus size={ICON_SIZE.row} />{translate("notebook.addNote")}</button>
      <button className="menu-item" role="menuitem" onClick={choose(onAddChild)}><FolderPlus size={ICON_SIZE.row} />{translate("notebook.addChild")}</button>
      <div className="menu-separator" />
      <button className="menu-item" role="menuitem" onClick={choose(onRename)}><Pencil size={ICON_SIZE.row} />{translate("notebook.rename")}</button>
      <button className="menu-item" role="menuitem" onClick={choose(onMove)}><FolderInput size={ICON_SIZE.row} />{translate("notebook.move")}</button>
      <button className="menu-item" role="menuitem" onClick={choose(onChooseAppearance)}><Palette size={ICON_SIZE.row} />{translate("notebook.appearance")}</button>
      {onOpenDatabase && <button className="menu-item" role="menuitem" onClick={choose(onOpenDatabase)}><Table size={ICON_SIZE.row} />{translate("database.open")}</button>}
      <button className="menu-item" role="menuitem" onClick={choose(onEditProperties)}><ListPlus size={ICON_SIZE.row} />{translate("property.dialogTitle")}</button>
      <div className="menu-separator" />
      <button className="menu-item danger" role="menuitem" onClick={choose(() => void remove())}><Trash2 size={ICON_SIZE.row} />{translate("notebook.remove")}</button>
    </PopupMenu>
  );
}

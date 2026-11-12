import { FolderPlus, ListPlus, LockKeyhole, LockKeyholeOpen, Palette, Pencil, Table, Trash2 } from "lucide-react";
import type { LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { useConfirmPassphrase } from "../session/PassphraseConfirmProvider";
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
  const confirmPassphrase = useConfirmPassphrase();
  const { name, isLocked } = notebook.content;
  // ロックを外すと、中のメモが確認なしで開けるようになる。外す前にパスフレーズを確かめる。
  const toggleLock = async () => {
    if (!isLocked || await confirmPassphrase(translate("lock.confirmToUnlockNotebook", { name }))) {
      await repository.updateNotebook(notebook.id, { isLocked: !isLocked });
    }
  };
  const remove = async () => {
    // ノートブックを消すと、中のメモはノートブックの外に残る。ロックしたノートブックなら、ロックを外すのと同じ。
    if (isLocked && !(await confirmPassphrase(translate("lock.confirmToRemoveNotebook", { name })))) {
      return;
    }
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
      <button className="menu-item" role="menuitem" onClick={choose(() => void toggleLock())}>
        {isLocked ? <LockKeyholeOpen size={15} /> : <LockKeyhole size={15} />}{translate(isLocked ? "lock.unlockNotebook" : "lock.lockNotebook")}
      </button>
      <div className="menu-separator" />
      <button className="menu-item danger" role="menuitem" onClick={choose(() => void remove())}><Trash2 size={15} />{translate("notebook.remove")}</button>
    </PopupMenu>
  );
}

// 左の列のゴミ箱の行のメニュー。ゴミ箱のメモをまとめて完全に削除する（件数を出して確かめてから）。

import { Trash2 } from "lucide-react";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { useDialogs } from "../shared/DialogProvider";
import { PopupMenu } from "../shared/PopupMenu";

type TrashActionsMenuProps = {
  anchor: HTMLElement;
  // ゴミ箱にあるメモの ID。
  trashedNoteIds: string[];
  repository: NoteRepository;
  onClose: () => void;
};

export function TrashActionsMenu({ anchor, trashedNoteIds, repository, onClose }: TrashActionsMenuProps) {
  const dialogs = useDialogs();
  const emptyTrash = async () => {
    onClose();
    const accepted = await dialogs.confirm({
      message: translate("sidebar.emptyTrashConfirm", { count: trashedNoteIds.length }), confirmLabel: translate("editor.removePermanently"), danger: true,
    });
    if (!accepted) {
      return;
    }
    for (const noteId of trashedNoteIds) {
      await repository.removeNotePermanently(noteId);
    }
  };
  return (
    <PopupMenu anchor={anchor} onClose={onClose}>
      <button className="menu-item danger" role="menuitem" disabled={trashedNoteIds.length === 0} onClick={() => void emptyTrash()}>
        <Trash2 size={15} />{translate("sidebar.emptyTrash", { count: trashedNoteIds.length })}
      </button>
    </PopupMenu>
  );
}

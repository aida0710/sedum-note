// 左の列のゴミ箱の行のメニュー。ゴミ箱のメモをまとめて完全に削除する（件数を出して確かめてから）。
// 件数が多いと数秒以上かかるので、進み具合を知らせに出す。

import { Trash2 } from "lucide-react";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { useDialogs } from "../shared/DialogProvider";
import { PopupMenu } from "../shared/PopupMenu";
import { useToast } from "../shared/ToastProvider";

// 進み具合の知らせを書き換える間隔（件数）。1 件ごとに書き換えると、知らせの数字が読めない速さで変わる。
const PROGRESS_TOAST_STEP = 20;

type TrashActionsMenuProps = {
  anchor: HTMLElement;
  // ゴミ箱にあるメモの ID。
  trashedNoteIds: string[];
  repository: NoteRepository;
  onClose: () => void;
};

export function TrashActionsMenu({ anchor, trashedNoteIds, repository, onClose }: TrashActionsMenuProps) {
  const dialogs = useDialogs();
  const showToast = useToast();
  const emptyTrash = async () => {
    onClose();
    const accepted = await dialogs.confirm({
      message: translate("sidebar.emptyTrashConfirm", { count: trashedNoteIds.length }), confirmLabel: translate("editor.removePermanently"), danger: true,
    });
    if (!accepted) {
      return;
    }
    const count = trashedNoteIds.length;
    // 1 件ごとに左の列へ知らせると、件数の 2 乗の時間がかかる。消し終えてから 1 回知らせる（進み具合は知らせに出す）。
    await repository.holdChangeNotifications(async () => {
      for (const [done, noteId] of trashedNoteIds.entries()) {
        if (done % PROGRESS_TOAST_STEP === 0) {
          showToast({ message: translate("toast.emptyingTrash", { done, count }) });
        }
        await repository.removeNotePermanently(noteId);
      }
    });
    showToast({ message: translate("toast.trashEmptied", { count }) });
  };
  return (
    <PopupMenu anchor={anchor} onClose={onClose}>
      <button className="menu-item danger" role="menuitem" disabled={trashedNoteIds.length === 0} onClick={() => void emptyTrash()}>
        <Trash2 size={15} />{translate("sidebar.emptyTrash", { count: trashedNoteIds.length })}
      </button>
    </PopupMenu>
  );
}

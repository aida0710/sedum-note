// 左の列で複数のメモを選んでいるときに、選んだメモの 1 つを右クリックすると出るメニュー。
// 選んだメモをまとめてゴミ箱に入れる（ゴミ箱の中では元に戻す）か、選択を外す。

import { RotateCcw, Trash2, X } from "lucide-react";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { PopupMenu } from "../shared/PopupMenu";
import { resetNoteSelection } from "./noteSelection";
import { useTrashWithUndo } from "./useTrashWithUndo";
import { ICON_SIZE } from "../shared/iconSizes";

type SelectedNotesMenuProps = {
  anchor: HTMLElement;
  noteIds: string[];
  // 右クリックした行がゴミ箱の中か。ゴミ箱の中なら、まとめて元に戻す。
  inTrash: boolean;
  repository: NoteRepository;
  onClose: () => void;
};

export function SelectedNotesMenu({ anchor, noteIds, inTrash, repository, onClose }: SelectedNotesMenuProps) {
  const moveToTrash = useTrashWithUndo(repository);
  // 選んだあとで消えたメモや、もうゴミ箱にある・無いメモは除く。
  const targetIds = noteIds.filter((noteId) => {
    const note = repository.note(noteId);
    return note !== undefined && (note.content.trashedAt !== null) === inTrash;
  });
  const choose = (action: () => Promise<void> | void) => () => {
    onClose();
    resetNoteSelection();
    void action();
  };
  // 戻し終えてから 1 回だけ左の列へ知らせる（1 件ごとだと、件数の 2 乗の時間がかかる）。
  const restoreAll = () => repository.holdChangeNotifications(async () => {
    for (const noteId of targetIds) {
      await repository.restoreNoteFromTrash(noteId);
    }
  });
  return (
    <PopupMenu anchor={anchor} onClose={onClose}>
      {inTrash && (
        <button className="menu-item" role="menuitem" onClick={choose(restoreAll)}>
          <RotateCcw size={ICON_SIZE.row} />{translate("sidebar.restoreSelected", { count: targetIds.length })}
        </button>
      )}
      <button className="menu-item" role="menuitem" onClick={choose(() => undefined)}><X size={ICON_SIZE.row} />{translate("sidebar.clearSelection")}</button>
      {/* 危険な操作は、ほかのメニューと同じく最後に置く。 */}
      {!inTrash && (
        <>
          <div className="menu-separator" />
          <button className="menu-item danger" role="menuitem" onClick={choose(() => moveToTrash(targetIds))}>
            <Trash2 size={ICON_SIZE.row} />{translate("sidebar.trashSelected", { count: targetIds.length })}
          </button>
        </>
      )}
    </PopupMenu>
  );
}

// 左の列のメモの 1 行。押すと開く。「…」か右クリックでメニュー（名前の変更・お気に入り・ピン留め・ゴミ箱）を出し、
// ドラッグして別の一覧へ落とせる。

import { MoreHorizontal, Pencil, Pin, PinOff, RotateCcw, Star, StarOff, Trash2 } from "lucide-react";
import { useContext, useState } from "react";
import type { NoteView } from "../../core/notes/noteQueries";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { UnsyncedRecordsContext } from "../session/useRepositorySnapshot";
import { useDialogs } from "../shared/DialogProvider";
import { PopupMenu } from "../shared/PopupMenu";
import { InlineNameInput } from "./InlineNameInput";
import { startNoteDrag } from "./noteDrag";
import { useNoteDragState } from "./noteDragState";
import { useTrashWithUndo } from "./useTrashWithUndo";
import { viewKey, type WorkspaceNavigation } from "./useWorkspaceNavigation";

type SidebarNoteRowProps = {
  note: LiveNote;
  // この行が並んでいる一覧。ドラッグで「どこから移すか」を決めるのに使う。
  view: NoteView;
  paddingLeft: number;
  navigation: WorkspaceNavigation;
  repository: NoteRepository;
};

export function SidebarNoteRow({ note, view, paddingLeft, navigation, repository }: SidebarNoteRowProps) {
  const unsyncedIds = useContext(UnsyncedRecordsContext);
  const dialogs = useDialogs();
  const moveToTrash = useTrashWithUndo(repository);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState(false);
  const { content } = note;
  const inTrash = content.trashedAt !== null;
  const title = content.title || translate("sidebar.untitled");
  // この行からドラッグしている間は、元の行を薄くする（持ち上げたことが分かるように）。
  const dragState = useNoteDragState();
  const isDragged = dragState?.noteId === note.id && dragState.fromViewKey === viewKey(view);

  if (renaming) {
    return (
      <InlineNameInput initialName={content.title} placeholder={translate("editor.titlePlaceholder")} onDone={(title) => {
        setRenaming(false);
        if (title !== null && title !== content.title) {
          void repository.updateNote(note.id, { title });
        }
      }} />
    );
  }
  const choose = (action: () => unknown) => () => {
    setMenuAnchor(null);
    void action();
  };
  const removePermanently = async () => {
    const accepted = await dialogs.confirm({
      message: translate("editor.removePermanentlyConfirm"), confirmLabel: translate("editor.removePermanently"), danger: true,
    });
    if (accepted) {
      await repository.removeNotePermanently(note.id);
    }
  };
  return (
    <div className={`nav-row${isDragged ? " dragging" : ""}`} onContextMenu={(event) => { event.preventDefault(); setMenuAnchor(event.currentTarget); }}>
      <button className={`tree-note${navigation.activeTab === note.id ? " active" : ""}`} style={{ paddingLeft }}
        draggable onDragStart={(event) => startNoteDrag(event, { noteId: note.id, title, fromView: view })}
        onClick={() => navigation.openNote(note.id)} onDoubleClick={() => setRenaming(true)}>
        {unsyncedIds.has(note.id) && <span className="unsynced-dot" title={translate("editor.unsynced")} />}
        {title}
      </button>
      <span className="row-actions">
        <button className="icon-button" aria-label={translate("sidebar.noteActions", { title })} aria-haspopup="menu"
          onClick={(event) => setMenuAnchor(event.currentTarget)}>
          <MoreHorizontal size={14} />
        </button>
      </span>
      {menuAnchor && (
        <PopupMenu anchor={menuAnchor} onClose={() => setMenuAnchor(null)}>
          <button className="menu-item" role="menuitem" onClick={choose(() => setRenaming(true))}><Pencil size={15} />{translate("notebook.rename")}</button>
          {!inTrash && (
            <>
              <button className="menu-item" role="menuitem" onClick={choose(() => repository.updateNote(note.id, { bookmarked: !content.bookmarked }))}>
                {content.bookmarked ? <StarOff size={15} /> : <Star size={15} />}{translate(content.bookmarked ? "editor.unbookmark" : "editor.bookmark")}
              </button>
              <button className="menu-item" role="menuitem" onClick={choose(() => repository.updateNote(note.id, { pinned: !content.pinned }))}>
                {content.pinned ? <PinOff size={15} /> : <Pin size={15} />}{translate(content.pinned ? "editor.unpin" : "editor.pin")}
              </button>
              <div className="menu-separator" />
              <button className="menu-item danger" role="menuitem" onClick={choose(() => moveToTrash(note.id))}><Trash2 size={15} />{translate("editor.moveToTrash")}</button>
            </>
          )}
          {inTrash && (
            <>
              <button className="menu-item" role="menuitem" onClick={choose(() => repository.restoreNoteFromTrash(note.id))}><RotateCcw size={15} />{translate("editor.restore")}</button>
              <button className="menu-item danger" role="menuitem" onClick={choose(removePermanently)}><Trash2 size={15} />{translate("editor.removePermanently")}</button>
            </>
          )}
        </PopupMenu>
      )}
    </div>
  );
}

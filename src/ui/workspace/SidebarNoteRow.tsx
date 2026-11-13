// 左の列のメモの 1 行。押すと開く。「…」か右クリックでメニュー（名前の変更・お気に入り・ピン留め・ゴミ箱）を出し、
// ドラッグして別の一覧へ落とせる。Ctrl（Mac では Command）か Shift を押しながら押すと、開かずに選ぶ（noteSelection.ts）。

import { MoreHorizontal, Pencil, Pin, PinOff, RotateCcw, Star, StarOff, Trash2 } from "lucide-react";
import { useContext, useState } from "react";
import type { NoteView } from "../../core/notes/noteQueries";
import type { SearchSnippet } from "../../core/notes/noteSearchSnippet";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { UnsyncedRecordsContext } from "../session/useRepositorySnapshot";
import { useDialogs } from "../shared/DialogProvider";
import { PopupMenu } from "../shared/PopupMenu";
import { isApplePlatform } from "../shared/shortcutKeys";
import { InlineNameInput } from "./InlineNameInput";
import { startNoteDrag } from "./noteDrag";
import { useNoteDragState } from "./noteDragState";
import { resetNoteSelection, selectNoteRange, toggleNoteSelection, useNoteSelection } from "./noteSelection";
import { SelectedNotesMenu } from "./SelectedNotesMenu";
import { focusViewRowOfNote } from "./sidebarKeyboard";
import { useTrashWithUndo } from "./useTrashWithUndo";
import { viewKey, type WorkspaceNavigation } from "./useWorkspaceNavigation";

type SidebarNoteRowProps = {
  note: LiveNote;
  // この行が並んでいる一覧。ドラッグで「どこから移すか」を決めるのに使う。
  view: NoteView;
  // この一覧に並んでいるメモの ID（上から順）。Shift で範囲を選ぶのに使う。
  listedNoteIds: string[];
  paddingLeft: number;
  navigation: WorkspaceNavigation;
  repository: NoteRepository;
  // 検索の結果の行に添える、本文の中で当たった所。無ければ題だけの 1 行。
  snippet?: SearchSnippet | null;
};

export function SidebarNoteRow({ note, view, listedNoteIds, paddingLeft, navigation, repository, snippet = null }: SidebarNoteRowProps) {
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
  const isDragged = (dragState?.noteIds.includes(note.id) ?? false) && dragState?.fromViewKey === viewKey(view);
  const selection = useNoteSelection();
  const isSelected = selection.noteIds.includes(note.id);

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
  const selectOrOpen = (event: React.MouseEvent) => {
    const selectionContext = { orderedIds: listedNoteIds, openNoteId: navigation.activeTab };
    if (isApplePlatform() ? event.metaKey : event.ctrlKey) {
      toggleNoteSelection(note.id, selectionContext);
    } else if (event.shiftKey) {
      selectNoteRange(note.id, selectionContext);
    } else {
      resetNoteSelection(note.id);
      navigation.openNote(note.id);
    }
  };
  // 選んだメモの 1 つを右クリックしたら、選んだメモをまとめて扱うメニューを出す。
  const opensSelectionMenu = isSelected && selection.noteIds.length > 1;
  const rowClassName = ["tree-note", navigation.activeTab === note.id && "active", isSelected && "selected", snippet && "with-snippet"].filter(Boolean).join(" ");
  return (
    <div className={`nav-row${isDragged ? " dragging" : ""}`} onContextMenu={(event) => { event.preventDefault(); setMenuAnchor(event.currentTarget); }}>
      <button className={rowClassName} style={{ paddingLeft }} aria-pressed={selection.noteIds.length > 0 ? isSelected : undefined}
        draggable onDragStart={(event) => startNoteDrag(event, { noteId: note.id, title, fromView: view })}
        onClick={selectOrOpen} onDoubleClick={() => setRenaming(true)} onKeyDown={(event) => {
          focusViewRowOfNote(event, viewKey(view));
          if (event.key === "Escape") {
            resetNoteSelection(note.id);
          }
        }}>
        {unsyncedIds.has(note.id) && <span className="unsynced-dot" title={translate("editor.unsynced")} />}
        {snippet ? (
          <>
            <span className="tree-note-title">{title}</span>
            <span className="tree-note-snippet">{snippet.before}<mark>{snippet.match}</mark>{snippet.after}</span>
          </>
        ) : title}
      </button>
      <span className="row-actions">
        <button className="icon-button" aria-label={translate("sidebar.noteActions", { title })} aria-haspopup="menu"
          onClick={(event) => setMenuAnchor(event.currentTarget)}>
          <MoreHorizontal size={14} />
        </button>
      </span>
      {menuAnchor && opensSelectionMenu && (
        <SelectedNotesMenu anchor={menuAnchor} noteIds={selection.noteIds} inTrash={inTrash} repository={repository} onClose={() => setMenuAnchor(null)} />
      )}
      {menuAnchor && !opensSelectionMenu && (
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
              <button className="menu-item danger" role="menuitem" onClick={choose(() => moveToTrash([note.id]))}><Trash2 size={15} />{translate("editor.moveToTrash")}</button>
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

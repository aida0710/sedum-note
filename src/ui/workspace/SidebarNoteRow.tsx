// 左の列のメモの 1 行。押すと開く。「…」か右クリックでメニュー（名前の変更・お気に入り・ピン留め・ゴミ箱）を出し、
// ドラッグして別の一覧へ落とせる。Ctrl（Mac では Command）か Shift を押しながら押すと、開かずに選ぶ（noteSelection.ts）。

import { MoreHorizontal, Pencil, Pin, PinOff, RotateCcw, Star, StarOff, Trash2 } from "lucide-react";
import { memo, useState } from "react";
import type { NoteView } from "../../core/notes/noteQueries";
import type { SearchSnippet } from "../../core/notes/noteSearchSnippet";
import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import type { LanguageChoice } from "../preferences/devicePreferences";
import { useDialogs } from "../shared/DialogProvider";
import { PopupMenu } from "../shared/PopupMenu";
import { isApplePlatform } from "../shared/shortcutKeys";
import { startNoteDrag } from "./noteDrag";
import { useSidebarDragState } from "./sidebarDragState";
import { resetNoteSelection, selectNoteRange, toggleNoteSelection, useNoteSelection } from "./noteSelection";
import { SelectedNotesMenu } from "./SelectedNotesMenu";
import { extendNoteSelectionByKey, focusViewRowOfNote, isUnmodifiedKey, rowBesideNotesToRemove } from "./sidebarKeyboard";
import { SidebarNameRow } from "./SidebarNameRow";
import { treeDepthStyle } from "../shared/treeDepthStyle";
import { useRowFocusAfterNaming } from "./useRowFocusAfterNaming";
import { useTrashWithUndo } from "./useTrashWithUndo";
import { viewKey } from "./useWorkspaceNavigation";

type SidebarNoteRowProps = {
  note: LiveNote;
  // この行が並んでいる一覧。ドラッグで「どこから移すか」を決めるのに使う。
  view: NoteView;
  // この一覧に並んでいるメモの ID（上から順）。Shift で範囲を選ぶのに使う。
  listedNoteIds: string[];
  // このメモが並ぶ一覧の行の、段の深さ。null は、木の外（検索の結果）。
  depth: number | null;
  // タブで開いているメモ（か設定などのタブ）の ID。
  activeTab: string | null;
  openNote: (noteId: string) => void;
  repository: NoteRepository;
  // まだ同期先へ送っていないか。
  unsynced: boolean;
  // 画面の言語の設定。行は描き直しを省くので、言語を変えたときに描き直すために受け取る。
  language: LanguageChoice;
  // 検索の結果の行に添える、本文の中で当たった所。無ければ題だけの 1 行。
  snippet?: SearchSnippet | null;
};

// 行は 1 つの一覧に 2,000 件並ぶことがある。本文を打つたびに全部の行を描き直すと、1 文字ごとに数十 ms 止まるので、
// 受け取る値が変わらない行は描き直さない。view は描くたびに作り直される入れ物なので、指す一覧（viewKey）で比べる。
function isSameRow(previous: SidebarNoteRowProps, next: SidebarNoteRowProps): boolean {
  const propNames = new Set([...Object.keys(previous), ...Object.keys(next)]) as Set<keyof SidebarNoteRowProps>;
  return [...propNames].every((name) => (name === "view" ? viewKey(previous.view) === viewKey(next.view) : Object.is(previous[name], next[name])));
}

export const SidebarNoteRow = memo(SidebarNoteRowContent, isSameRow);

function SidebarNoteRowContent({ note, view, listedNoteIds, depth, activeTab, openNote, repository, unsynced, snippet = null }: SidebarNoteRowProps) {
  const dialogs = useDialogs();
  const moveToTrash = useTrashWithUndo(repository);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState(false);
  const rowButton = useRowFocusAfterNaming(renaming);
  const { content } = note;
  const inTrash = content.trashedAt !== null;
  const title = content.title || translate("sidebar.untitled");
  // この行からドラッグしている間は、元の行を薄くする（持ち上げたことが分かるように）。
  const dragged = useSidebarDragState()?.dragged;
  const isDragged = dragged?.kind === "notes" && dragged.noteIds.includes(note.id) && dragged.fromViewKey === viewKey(view);
  const selection = useNoteSelection();
  const isSelected = selection.noteIds.includes(note.id);

  if (renaming) {
    return (
      <SidebarNameRow rowKind="note" depth={depth} initialName={content.title} placeholder={translate("editor.titlePlaceholder")} onDone={(title) => {
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
    return accepted;
  };
  const selectOrOpen = (event: React.MouseEvent) => {
    const selectionContext = { orderedIds: listedNoteIds, openNoteId: activeTab };
    if (isApplePlatform() ? event.metaKey : event.ctrlKey) {
      toggleNoteSelection(note.id, selectionContext);
    } else if (event.shiftKey) {
      selectNoteRange(note.id, selectionContext);
    } else {
      resetNoteSelection(note.id);
      openNote(note.id);
    }
  };
  // 選んだメモの 1 つを右クリックしたら、選んだメモをまとめて扱うメニューを出す。
  const opensSelectionMenu = isSelected && selection.noteIds.length > 1;
  const rowClassName = ["tree-note", activeTab === note.id && "active", isSelected && "selected", snippet && "with-snippet", depth === null && "unindented"].filter(Boolean).join(" ");
  // Delete: 選んだメモの 1 つなら選んだメモをまとめて、そうでなければこのメモを、ゴミ箱に入れる（ゴミ箱の中では、確かめてから完全に削除する）。
  // 消したあとは、次の行へフォーカスを移す（確認をやめたら、移さない）。
  const removeByKey = async (row: HTMLElement) => {
    if (inTrash) {
      const nextRow = rowBesideNotesToRemove(row, [note.id]);
      if (await removePermanently()) {
        nextRow?.focus();
      }
      return;
    }
    // 選んだあとで消えたメモと、もうゴミ箱にあるメモは除く（右クリックのメニューと同じ）。
    const noteIds = (isSelected ? selection.noteIds : [note.id]).filter((noteId) => repository.note(noteId)?.content.trashedAt === null);
    const nextRow = rowBesideNotesToRemove(row, noteIds);
    // 選択は外す。ゴミ箱に入れたメモを選んだままにすると、次のドラッグで一緒に運んで、ゴミ箱から戻してしまう。
    resetNoteSelection();
    await moveToTrash(noteIds);
    nextRow?.focus();
  };
  return (
    <div className={`nav-row${isDragged ? " dragging" : ""}`} onContextMenu={(event) => { event.preventDefault(); setMenuAnchor(event.currentTarget); }}>
      <button ref={rowButton} className={rowClassName} style={treeDepthStyle(depth)} title={title} data-note-id={note.id} aria-pressed={selection.noteIds.length > 0 ? isSelected : undefined}
        draggable onDragStart={(event) => startNoteDrag(event, { noteId: note.id, title, fromView: view })}
        onClick={selectOrOpen} onDoubleClick={() => setRenaming(true)} onKeyDown={(event) => {
          focusViewRowOfNote(event, viewKey(view));
          extendNoteSelectionByKey(event, { noteId: note.id, listedNoteIds });
          if (event.key === "Escape") {
            resetNoteSelection(note.id);
          } else if (isUnmodifiedKey(event, "F2")) {
            setRenaming(true);
          } else if (isUnmodifiedKey(event, "Delete")) {
            void removeByKey(event.currentTarget);
          }
        }}>
        {unsynced && <span className="unsynced-dot" title={translate("editor.unsynced")} />}
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

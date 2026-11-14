// スマホの「ノートブック」タブの、ノートブックの 1 行。押すと中のメモの一覧を開く。
// 行の「…」（Android では長押しでも）から、PC の左の列と同じメニュー（中へのメモと子の追加・名前の変更・色とアイコン・
// プロパティ・移動・削除）を開く。名前は、行の中の入力欄ではなく 1 行のダイアログで聞く。

import { MoreHorizontal } from "lucide-react";
import { type CSSProperties, useState } from "react";
import type { LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { useDialogs } from "../shared/DialogProvider";
import { type NotebookColors, NotebookMark } from "../shared/notebookAppearance";
import { createNoteInView } from "../workspace/createNoteInView";
import { NotebookActionsMenu } from "../workspace/NotebookActionsMenu";
import { NotebookAppearanceDialog } from "../workspace/NotebookAppearanceDialog";
import { NotebookPropertiesDialog } from "../workspace/NotebookPropertiesDialog";
import { MoveNotebookDialog } from "../workspace/MoveNotebookDialog";
import { ICON_SIZE } from "../shared/iconSizes";

type MobileNotebookRowProps = {
  notebook: LiveNotebook;
  // 木の中の深さ。最上位が 0。深さの分だけ字下げする。
  depth: number;
  noteCount: number;
  notebookColors: NotebookColors;
  repository: NoteRepository;
  onOpen: () => void;
  onOpenNote: (noteId: string) => void;
};

type NotebookDialog = "appearance" | "properties" | "move";

export function MobileNotebookRow({ notebook, depth, noteCount, notebookColors, repository, onOpen, onOpenNote }: MobileNotebookRowProps) {
  const dialogs = useDialogs();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [openDialog, setOpenDialog] = useState<NotebookDialog | null>(null);
  const { name } = notebook.content;
  const rename = async () => {
    const newName = (await dialogs.prompt({ title: translate("notebook.rename"), message: translate("sidebar.newNotebookPlaceholder"), confirmLabel: translate("common.save"), initialValue: name }))?.trim();
    if (newName && newName !== name) {
      await repository.updateNotebook(notebook.id, { name: newName });
    }
  };
  const addChild = async () => {
    const childName = (await dialogs.prompt({ title: translate("notebook.addChild"), message: translate("sidebar.newNotebookPlaceholder"), confirmLabel: translate("common.create") }))?.trim();
    if (childName) {
      await repository.createNotebook(childName, notebook.id);
    }
  };
  const addNote = async () => onOpenNote((await createNoteInView(repository, { kind: "notebook", notebookId: notebook.id })).id);
  return (
    <div className="library-row notebook-row" style={{ "--notebook-depth": depth } as CSSProperties}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuAnchor(event.currentTarget);
      }}>
      <button className="notebook-row-open" onClick={onOpen}>
        <NotebookMark notebook={notebook} colors={notebookColors} /><span className="library-row-label">{name}</span>
        <span className="count">{noteCount}</span>
      </button>
      <button className="icon-button" aria-label={translate("editor.more")} aria-haspopup="menu" aria-expanded={menuAnchor !== null}
        onClick={(event) => setMenuAnchor(event.currentTarget)}>
        <MoreHorizontal size={ICON_SIZE.touch} />
      </button>
      {menuAnchor && (
        <NotebookActionsMenu anchor={menuAnchor} notebook={notebook} repository={repository} onClose={() => setMenuAnchor(null)}
          onRename={() => void rename()}
          onMove={() => setOpenDialog("move")}
          onChooseAppearance={() => setOpenDialog("appearance")}
          onEditProperties={() => setOpenDialog("properties")}
          onAddNote={() => void addNote()}
          onAddChild={() => void addChild()} />
      )}
      {openDialog === "appearance" && <NotebookAppearanceDialog notebook={notebook} repository={repository} onClose={() => setOpenDialog(null)} />}
      {openDialog === "properties" && <NotebookPropertiesDialog notebook={notebook} repository={repository} onClose={() => setOpenDialog(null)} />}
      {openDialog === "move" && <MoveNotebookDialog notebook={notebook} repository={repository} onClose={() => setOpenDialog(null)} />}
    </div>
  );
}

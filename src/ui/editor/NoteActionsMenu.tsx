// メモの「…」メニュー: ピン留め、ノートブックの付け外し、テンプレートにする、複製、結合、メモの中の検索、履歴、ファイルへの書き出し、印刷、ゴミ箱。

import { Check, Copy, FileDown, History, Merge, LayoutTemplate, Pin, PinOff, Printer, Search, Trash2 } from "lucide-react";
import type { LiveNote, LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { type MessageKey, translate } from "../i18n/translate";
import type { NoteFileFormat } from "../markdown/noteFileExport";
import { isPrintAvailable } from "../platform/printPage";
import { PopupMenu } from "../shared/PopupMenu";
import { useTrashWithUndo } from "../workspace/useTrashWithUndo";

const EXPORT_FORMATS: Array<{ format: NoteFileFormat; label: MessageKey }> = [
  { format: "markdown", label: "editor.exportMarkdown" },
  { format: "html", label: "editor.exportHtml" },
  { format: "text", label: "editor.exportText" },
];

type NoteActionsMenuProps = {
  anchor: HTMLElement;
  note: LiveNote;
  notebooks: LiveNotebook[];
  repository: NoteRepository;
  onFind: () => void;
  onPrint: () => void;
  onDuplicate: () => Promise<unknown>;
  onMergeNote: () => void;
  onShowHistory: () => void;
  onExport: (format: NoteFileFormat) => void;
  onClose: () => void;
};

export function NoteActionsMenu({ anchor, note, notebooks, repository, onFind, onPrint, onDuplicate, onMergeNote, onShowHistory, onExport, onClose }: NoteActionsMenuProps) {
  const { content } = note;
  const moveToTrash = useTrashWithUndo(repository);
  const toggleNotebook = (notebookId: string) => {
    const notebookIds = content.notebookIds.includes(notebookId)
      ? content.notebookIds.filter((id) => id !== notebookId)
      : [...content.notebookIds, notebookId];
    void repository.updateNote(note.id, { notebookIds });
  };
  const runAndClose = (action: () => Promise<unknown>) => () => {
    onClose();
    void action();
  };
  return (
    <PopupMenu anchor={anchor} onClose={onClose}>
      <button className="menu-item" role="menuitem" onClick={runAndClose(() => repository.updateNote(note.id, { pinned: !content.pinned }))}>
        {content.pinned ? <PinOff size={15} /> : <Pin size={15} />}
        {translate(content.pinned ? "editor.unpin" : "editor.pin")}
      </button>
      {notebooks.length > 0 && (
        <>
          <div className="menu-separator" />
          <div className="menu-heading">{translate("editor.notebooks")}</div>
          {notebooks.map((notebook) => (
            <button key={notebook.id} className="menu-item" role="menuitemcheckbox" aria-checked={content.notebookIds.includes(notebook.id)} onClick={() => toggleNotebook(notebook.id)}>
              <span className="nav-label">{notebook.content.name}</span>
              {content.notebookIds.includes(notebook.id) && <Check size={15} className="menu-check" />}
            </button>
          ))}
        </>
      )}
      <div className="menu-separator" />
      <button className="menu-item" role="menuitem" onClick={runAndClose(() => repository.updateNote(note.id, { isTemplate: !content.isTemplate, pinned: false }))}>
        <LayoutTemplate size={15} />{translate(content.isTemplate ? "editor.stopBeingTemplate" : "editor.makeTemplate")}
      </button>
      <button className="menu-item" role="menuitem" onClick={runAndClose(onDuplicate)}>
        <Copy size={15} />{translate("editor.duplicate")}
      </button>
      {content.trashedAt === null && (
        <button className="menu-item" role="menuitem" onClick={() => { onClose(); onMergeNote(); }}>
          <Merge size={15} />{translate("editor.mergeNote")}
        </button>
      )}
      <button className="menu-item" role="menuitem" onClick={() => { onClose(); onFind(); }}>
        <Search size={15} />{translate("editor.find")}
      </button>
      <button className="menu-item" role="menuitem" onClick={() => { onClose(); onShowHistory(); }}>
        <History size={15} />{translate("editor.history")}
      </button>
      {EXPORT_FORMATS.map(({ format, label }) => (
        <button key={format} className="menu-item" role="menuitem" onClick={() => { onClose(); onExport(format); }}>
          <FileDown size={15} />{translate(label)}
        </button>
      ))}
      {isPrintAvailable() && (
        <button className="menu-item" role="menuitem" onClick={() => { onClose(); onPrint(); }}>
          <Printer size={15} />{translate("editor.print")}
        </button>
      )}
      <button className="menu-item danger" role="menuitem" onClick={runAndClose(() => moveToTrash(note.id))}>
        <Trash2 size={15} />{translate("editor.moveToTrash")}
      </button>
    </PopupMenu>
  );
}

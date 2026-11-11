// メモの「…」メニュー: ピン留め、ノートブックの付け外し、メモの中の検索、履歴、Markdown での書き出し、ゴミ箱。

import { Check, FileDown, History, Pin, PinOff, Search, Trash2 } from "lucide-react";
import type { LiveNote, LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { PopupMenu } from "../shared/PopupMenu";

type NoteActionsMenuProps = {
  anchor: HTMLElement;
  note: LiveNote;
  notebooks: LiveNotebook[];
  repository: NoteRepository;
  onFind: () => void;
  onShowHistory: () => void;
  onExportMarkdown: () => void;
  onClose: () => void;
};

export function NoteActionsMenu({ anchor, note, notebooks, repository, onFind, onShowHistory, onExportMarkdown, onClose }: NoteActionsMenuProps) {
  const { content } = note;
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
      <button className="menu-item" role="menuitem" onClick={() => { onClose(); onFind(); }}>
        <Search size={15} />{translate("editor.find")}
      </button>
      <button className="menu-item" role="menuitem" onClick={() => { onClose(); onShowHistory(); }}>
        <History size={15} />{translate("editor.history")}
      </button>
      <button className="menu-item" role="menuitem" onClick={() => { onClose(); onExportMarkdown(); }}>
        <FileDown size={15} />{translate("editor.exportMarkdown")}
      </button>
      <button className="menu-item danger" role="menuitem" onClick={runAndClose(() => repository.moveNoteToTrash(note.id))}>
        <Trash2 size={15} />{translate("editor.moveToTrash")}
      </button>
    </PopupMenu>
  );
}

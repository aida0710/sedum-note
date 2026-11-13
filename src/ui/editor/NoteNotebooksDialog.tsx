// メモを入れるノートブックを選ぶダイアログ。メモは複数のノートブックに入れられるので、入っているものに印を付けて開き、
// いくつでも付け外しでき、全部外すこともできる。ノートブックが多くても選べるよう、名前で絞り込め、一覧は枠の中で送る。

import { Search } from "lucide-react";
import { useState } from "react";
import type { LiveNote, LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { ModalDialog } from "../shared/ModalDialog";
import { assignNotebookColors, NotebookMark } from "../shared/notebookAppearance";
import { notebookTreeRows } from "./notebookTreeRows";

// 行の左の余白（.menu-item と同じ）。
const ROW_PADDING_LEFT = 10;
// 階層 1 段ごとの字下げ。子のチェックボックスが、親のノートブックの印の真下に来る幅（チェックボックス 15px + 間 10px。app.css の .notebook-choice）。
const TREE_INDENT_STEP = 25;

type NoteNotebooksDialogProps = {
  note: LiveNote;
  notebooks: LiveNotebook[];
  repository: NoteRepository;
  onClose: () => void;
};

export function NoteNotebooksDialog({ note, notebooks, repository, onClose }: NoteNotebooksDialogProps) {
  const [searchText, setSearchText] = useState("");
  const rows = notebookTreeRows(notebooks, searchText);
  const notebookColors = assignNotebookColors(notebooks);
  const title = translate("editor.notebookPickerTitle");
  // 押すとその場で付け外しし、確定のボタンは置かない。色とアイコンのダイアログと同じ動きで、押し間違えても
  // 押し直せば戻り、メモの上のノートブックの印もすぐ変わる。確定してから書く形だと、開いている間にほかのデバイスやウィンドウが
  // 変えた分を、開いたときの組で上書きしてしまう。続けて押したときに前の変更を落とさないよう、押した時点の手元の記録から作る。
  const toggleNotebook = (notebookId: string) => {
    const current = repository.note(note.id)?.content.notebookIds ?? note.content.notebookIds;
    const notebookIds = current.includes(notebookId) ? current.filter((id) => id !== notebookId) : [...current, notebookId];
    void repository.updateNote(note.id, { notebookIds });
  };
  return (
    <ModalDialog label={title} title={title} description={translate("editor.notebookPickerDescription")} className="note-picker" onClose={onClose}>
      <label className="sidebar-search">
        <Search size={14} />
        <input autoFocus value={searchText} placeholder={translate("editor.notebookPickerSearchPlaceholder")} onChange={(event) => setSearchText(event.target.value)} />
      </label>
      <div className="note-picker-list" role="group" aria-label={translate("sidebar.notebooks")}>
        {rows.length === 0 && <div className="tree-empty">{translate("editor.notebookPickerNone")}</div>}
        {rows.map(({ notebook, depth, matchesSearch }) => (
          <label key={notebook.id} className={`menu-item notebook-choice${matchesSearch ? "" : " ancestor-only"}`}
            style={{ paddingLeft: ROW_PADDING_LEFT + depth * TREE_INDENT_STEP }}>
            <input type="checkbox" checked={note.content.notebookIds.includes(notebook.id)} onChange={() => toggleNotebook(notebook.id)}
              onKeyDown={(event) => {
                // チェックボックスは Space でしか切り替わらないので、Enter でも付け外しできるようにする。
                if (event.key === "Enter" && !isImeKeyEvent(event.nativeEvent)) {
                  event.preventDefault();
                  toggleNotebook(notebook.id);
                }
              }} />
            <NotebookMark notebook={notebook} colors={notebookColors} />
            <span className="nav-label">{notebook.content.name}</span>
          </label>
        ))}
      </div>
      <div className="form-actions">
        <button type="button" className="primary-button" onClick={onClose}>{translate("common.close")}</button>
      </div>
    </ModalDialog>
  );
}

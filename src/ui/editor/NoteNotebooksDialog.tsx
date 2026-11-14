// メモを入れるノートブックを選ぶダイアログ。メモは複数のノートブックに入れられるので、入っているものに印を付けて開き、
// いくつでも付け外しでき、全部外すこともできる。ノートブックが多くても選べるよう、名前で絞り込め、一覧は枠の中で送る。
// 絞り込みの欄で ↓ を押すと一覧へ移り、一覧の中は ↑ ↓ Home End で移って Enter か Space で付け外しする。
// 打った名前のノートブックが無ければ、一覧の最後に「作成して追加」の行を出す（ダイアログを閉じて作り直さずに済むように）。

import { FolderPlus, Search } from "lucide-react";
import { useRef, useState } from "react";
import type { LiveNote, LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { moveFocusAmongItems } from "../shared/arrowKeyFocus";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { ModalDialog } from "../shared/ModalDialog";
import { assignNotebookColors, NotebookMark } from "../shared/notebookAppearance";
import { treeDepthStyle } from "../shared/treeDepthStyle";
import { notebookTreeRows } from "./notebookTreeRows";

// 一覧の中で ↑ ↓ で移る項目（ノートブックのチェックボックスと、作成して追加の行）。
const LIST_ITEM_SELECTOR = ".notebook-choice input, .notebook-create";

type NoteNotebooksDialogProps = {
  note: LiveNote;
  notebooks: LiveNotebook[];
  repository: NoteRepository;
  onClose: () => void;
};

export function NoteNotebooksDialog({ note, notebooks, repository, onClose }: NoteNotebooksDialogProps) {
  const [searchText, setSearchText] = useState("");
  const rows = notebookTreeRows(notebooks, searchText);
  const list = useRef<HTMLDivElement>(null);
  // 打った名前と同じ名前のノートブックが無ければ、その名前で作って入れられる。
  const nameToCreate = searchText.trim();
  const canCreate = nameToCreate !== "" && !notebooks.some((notebook) => notebook.content.name === nameToCreate);
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
  const createAndAdd = async () => {
    const created = await repository.createNotebook(nameToCreate);
    toggleNotebook(created.id);
  };
  return (
    <ModalDialog label={title} title={title} description={translate("editor.notebookPickerDescription")} className="note-picker" onClose={onClose}>
      <label className="sidebar-search">
        <Search size={14} />
        <input autoFocus value={searchText} placeholder={translate("editor.notebookPickerSearchPlaceholder")} onChange={(event) => setSearchText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && !isImeKeyEvent(event.nativeEvent)) {
              event.preventDefault();
              list.current?.querySelector<HTMLElement>(LIST_ITEM_SELECTOR)?.focus();
            }
          }} />
      </label>
      <div ref={list} className="note-picker-list" role="group" aria-label={translate("sidebar.notebooks")} onKeyDown={(event) => moveFocusAmongItems(event, LIST_ITEM_SELECTOR)}>
        {rows.length === 0 && <div className="tree-empty">{translate("editor.notebookPickerNone")}</div>}
        {rows.map(({ notebook, depth, matchesSearch }) => (
          <label key={notebook.id} className={`menu-item notebook-choice${matchesSearch ? "" : " ancestor-only"}`}
            style={treeDepthStyle(depth)}>
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
        {canCreate && (
          <button type="button" className="menu-item notebook-create" onClick={() => void createAndAdd()}>
            <FolderPlus size={15} /><span className="nav-label">{translate("editor.notebookPickerCreate", { name: nameToCreate })}</span>
          </button>
        )}
      </div>
      <div className="form-actions">
        <button type="button" className="primary-button" onClick={onClose}>{translate("common.close")}</button>
      </div>
    </ModalDialog>
  );
}

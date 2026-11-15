// メモを入れるノートブックを選んで移すダイアログ。メモは 1 つのノートブックにだけ入るので、選ぶとそこへ移して閉じる。
// 最後の「未指定」を選ぶと、どのノートブックにも入れない形に戻す。ノートブックが多くても選べるよう、名前で絞り込め、
// 一覧は枠の中で送る。絞り込みの欄で ↓ を押すと一覧へ移り、一覧の中は ↑ ↓ Home End で移って Enter か Space で選ぶ。
// 打った名前のノートブックが無ければ、一覧の最後に「作成して移動」の行を出す（ダイアログを閉じて作り直さずに済むように）。

import { Check, FolderPlus, Inbox, Search } from "lucide-react";
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
import { ICON_SIZE } from "../shared/iconSizes";

// 一覧の中で ↑ ↓ で移る項目（ノートブック、未指定、作成して移動の行）。
const LIST_ITEM_SELECTOR = ".notebook-choice, .notebook-create";

type MoveNoteToNotebookDialogProps = {
  note: LiveNote;
  notebooks: LiveNotebook[];
  repository: NoteRepository;
  onClose: () => void;
};

export function MoveNoteToNotebookDialog({ note, notebooks, repository, onClose }: MoveNoteToNotebookDialogProps) {
  const [searchText, setSearchText] = useState("");
  const rows = notebookTreeRows(notebooks, searchText);
  const list = useRef<HTMLDivElement>(null);
  // 打った名前と同じ名前のノートブックが無ければ、その名前で作って移せる。
  const nameToCreate = searchText.trim();
  const canCreate = nameToCreate !== "" && !notebooks.some((notebook) => notebook.content.name === nameToCreate);
  const notebookColors = assignNotebookColors(notebooks);
  const title = translate("editor.notebookPickerTitle");
  const moveTo = (notebookId: string | null) => {
    void repository.updateNote(note.id, { notebookId });
    onClose();
  };
  const createAndMove = async () => {
    moveTo((await repository.createNotebook(nameToCreate)).id);
  };
  const choice = (input: { key: string; notebookId: string | null; depth: number; dimmed: boolean; mark: React.ReactNode; label: string }) => {
    const isCurrent = note.content.notebookId === input.notebookId;
    return (
      <button key={input.key} type="button" className={`menu-item notebook-choice${input.dimmed ? " ancestor-only" : ""}`} style={treeDepthStyle(input.depth)}
        aria-current={isCurrent ? "true" : undefined} onClick={() => moveTo(input.notebookId)}>
        <span className="notebook-choice-check">{isCurrent && <Check size={ICON_SIZE.chip} />}</span>
        {input.mark}
        <span className="nav-label">{input.label}</span>
      </button>
    );
  };
  return (
    <ModalDialog label={title} title={title} description={translate("editor.notebookPickerDescription")} className="note-picker" onClose={onClose}>
      <label className="sidebar-search">
        <Search size={ICON_SIZE.row} />
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
        {rows.map(({ notebook, depth, matchesSearch }) => choice({
          key: notebook.id, notebookId: notebook.id, depth, dimmed: !matchesSearch,
          mark: <NotebookMark notebook={notebook} colors={notebookColors} />, label: notebook.content.name,
        }))}
        {/* 絞り込んでいる間は出さない（名前で探しているノートブックではない）。 */}
        {searchText.trim() === "" && choice({
          key: "unassigned", notebookId: null, depth: 0, dimmed: false, mark: <Inbox size={ICON_SIZE.row} />, label: translate("sidebar.unassigned"),
        })}
        {canCreate && (
          <button type="button" className="menu-item notebook-create" onClick={() => void createAndMove()}>
            <FolderPlus size={ICON_SIZE.row} /><span className="nav-label">{translate("editor.notebookPickerCreate", { name: nameToCreate })}</span>
          </button>
        )}
      </div>
      <div className="form-actions">
        <button type="button" className="primary-button" onClick={onClose}>{translate("common.close")}</button>
      </div>
    </ModalDialog>
  );
}

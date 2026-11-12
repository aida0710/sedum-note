// メモを 1 つ選ぶダイアログ（リンク先、結合するメモ）。タイトルで絞り込める。

import { Search } from "lucide-react";
import { useState } from "react";
import type { LiveNote } from "../../core/notes/noteRecords";
import { translate } from "../i18n/translate";
import { ModalDialog } from "../shared/ModalDialog";

// 一度に並べる件数。これより多いときは検索で絞ってもらう。
const MAX_LISTED_NOTES = 50;

type NotePickerProps = {
  // 何のために選ぶかの説明。
  title: string;
  // 選べるメモ（ゴミ箱の外で、いま開いているメモ以外）。
  candidates: LiveNote[];
  onPick: (noteId: string) => void;
  onCancel: () => void;
};

export function NotePicker({ title, candidates, onPick, onCancel }: NotePickerProps) {
  const [searchText, setSearchText] = useState("");
  const words = searchText.toLocaleLowerCase().split(/\s+/).filter((word) => word !== "");
  const listed = candidates
    .filter((note) => words.every((word) => note.content.title.toLocaleLowerCase().includes(word)))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_LISTED_NOTES);
  return (
    <ModalDialog label={title} className="note-picker" onClose={onCancel}>
        <p>{title}</p>
        <label className="sidebar-search">
          <Search size={14} />
          <input autoFocus value={searchText} placeholder={translate("sidebar.searchPlaceholder")} onChange={(event) => setSearchText(event.target.value)} />
        </label>
        <div className="note-picker-list">
          {listed.length === 0 && <div className="tree-empty">{translate("editor.noteLinkNone")}</div>}
          {listed.map((note) => (
            <button key={note.id} type="button" className="menu-item" onClick={() => onPick(note.id)}>
              <span className="nav-label">{note.content.title || translate("sidebar.untitled")}</span>
            </button>
          ))}
        </div>
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>{translate("common.cancel")}</button>
        </div>
    </ModalDialog>
  );
}

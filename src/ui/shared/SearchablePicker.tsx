// 一覧から 1 つ選ぶダイアログ。打った言葉で絞り込める。

import { Search } from "lucide-react";
import { useState } from "react";
import { translate } from "../i18n/translate";
import { ModalDialog } from "./ModalDialog";
import { containsAllWords, searchWordsOf } from "./searchWords";

// 一度に並べる件数。これより多いときは検索で絞ってもらう。
const MAX_LISTED_CHOICES = 50;

export type PickerChoice = { id: string; label: string };

type SearchablePickerProps = {
  // 何のために選ぶか（ダイアログの見出し）と、選んだら何が起きるかの説明。
  title: string;
  description?: string;
  // 選べるもの。並べたい順に渡す。
  choices: PickerChoice[];
  // 絞り込みの欄に、打つ前に出しておく文。
  searchPlaceholder: string;
  // 選べるものが無いときに出す文。
  emptyMessage: string;
  onPick: (choiceId: string) => void;
  onCancel: () => void;
};

export function SearchablePicker({ title, description, choices, searchPlaceholder, emptyMessage, onPick, onCancel }: SearchablePickerProps) {
  const [searchText, setSearchText] = useState("");
  const words = searchWordsOf(searchText);
  const listed = choices.filter((choice) => containsAllWords(choice.label, words)).slice(0, MAX_LISTED_CHOICES);
  return (
    <ModalDialog label={title} title={title} description={description} className="note-picker" onClose={onCancel}>
      <label className="sidebar-search">
        <Search size={14} />
        <input autoFocus value={searchText} placeholder={searchPlaceholder} onChange={(event) => setSearchText(event.target.value)} />
      </label>
      <div className="note-picker-list">
        {listed.length === 0 && <div className="tree-empty">{emptyMessage}</div>}
        {listed.map((choice) => (
          <button key={choice.id} type="button" className="menu-item" onClick={() => onPick(choice.id)}>
            <span className="nav-label">{choice.label}</span>
          </button>
        ))}
      </div>
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>{translate("common.cancel")}</button>
      </div>
    </ModalDialog>
  );
}

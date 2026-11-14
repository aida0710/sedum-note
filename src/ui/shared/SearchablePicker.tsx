// 一覧から 1 つ選ぶダイアログ。打った言葉で絞り込める。絞り込みの欄にいるまま、↑ ↓ で選んで Enter で決められる。

import { Search } from "lucide-react";
import { useState } from "react";
import { translate } from "../i18n/translate";
import { isImeKeyEvent } from "./imeKeyEvent";
import { ModalDialog } from "./ModalDialog";
import { containsAllWords, searchWordsOf } from "./searchWords";
import { useKeyboardListSelection } from "./useKeyboardListSelection";
import { ICON_SIZE } from "./iconSizes";

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
  const matching = choices.filter((choice) => containsAllWords(choice.label, words));
  const listed = matching.slice(0, MAX_LISTED_CHOICES);
  const { selected, selectFirst, list, moveSelectionByKey } = useKeyboardListSelection(listed.length);
  return (
    <ModalDialog label={title} title={title} description={description} className="note-picker" onClose={onCancel}>
      <label className="sidebar-search">
        <Search size={ICON_SIZE.row} />
        <input autoFocus value={searchText} placeholder={searchPlaceholder} aria-label={searchPlaceholder}
          onChange={(event) => { setSearchText(event.target.value); selectFirst(); }}
          onKeyDown={(event) => {
            const choice = listed[selected];
            if (isImeKeyEvent(event.nativeEvent) || moveSelectionByKey(event) || event.key !== "Enter" || choice === undefined) {
              return;
            }
            event.preventDefault();
            onPick(choice.id);
          }} />
      </label>
      <div ref={list} className="note-picker-list">
        {listed.length === 0 && <div className="tree-empty">{emptyMessage}</div>}
        {listed.map((choice, index) => (
          <button key={choice.id} type="button" aria-current={index === selected ? "true" : undefined}
            className={`menu-item${index === selected ? " on" : ""}`} onClick={() => onPick(choice.id)}>
            <span className="nav-label">{choice.label}</span>
          </button>
        ))}
        {/* 並べる数を超えた分は、黙って切らずに、何件あるかを伝える。 */}
        {matching.length > listed.length && <div className="tree-empty">{translate("picker.moreChoices", { count: matching.length - listed.length })}</div>}
      </div>
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>{translate("common.cancel")}</button>
      </div>
    </ModalDialog>
  );
}

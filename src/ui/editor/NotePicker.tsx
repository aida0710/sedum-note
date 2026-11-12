// メモを 1 つ選ぶダイアログ（リンク先、結合するメモ）。タイトルで絞り込める。

import type { LiveNote } from "../../core/notes/noteRecords";
import { translate } from "../i18n/translate";
import { SearchablePicker } from "../shared/SearchablePicker";

type NotePickerProps = {
  // 何のために選ぶかの説明。
  title: string;
  // 選べるメモ（ゴミ箱の外）。
  candidates: LiveNote[];
  onPick: (noteId: string) => void;
  onCancel: () => void;
};

export function NotePicker({ title, candidates, onPick, onCancel }: NotePickerProps) {
  const choices = [...candidates]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((note) => ({ id: note.id, label: note.content.title || translate("sidebar.untitled") }));
  return <SearchablePicker title={title} choices={choices} emptyMessage={translate("editor.noteLinkNone")} onPick={onPick} onCancel={onCancel} />;
}

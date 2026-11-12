// ブロックへのリンクの先を選ぶダイアログ。メモを選び、続けてそのメモの中のブロック（段落、見出し、箇条書きの項目）を選ぶ。
// 選んだブロックに ID が無ければ、ここで付ける（リンク先のメモの本文に、属性が 1 つ増える）。

import { useState } from "react";
import { ensureBlockId, linkableBlocks } from "../../core/notes/bodyBlocks";
import type { LiveNote } from "../../core/notes/noteRecords";
import { translate } from "../i18n/translate";
import { SearchablePicker } from "../shared/SearchablePicker";
import { NotePicker } from "./NotePicker";

type BlockLinkPickerProps = {
  // 選べるメモ（ゴミ箱の外）。いま開いているメモも含む。
  notes: LiveNote[];
  onPick: (link: { noteId: string; blockId: string }) => void;
  onCancel: () => void;
};

export function BlockLinkPicker({ notes, onPick, onCancel }: BlockLinkPickerProps) {
  const [pickedNote, setPickedNote] = useState<LiveNote | null>(null);
  if (!pickedNote) {
    return (
      <NotePicker title={translate("editor.blockLinkNotePickerTitle")} candidates={notes}
        onPick={(noteId) => setPickedNote(notes.find((note) => note.id === noteId) ?? null)} onCancel={onCancel} />
    );
  }
  const blocks = linkableBlocks(pickedNote.body);
  return (
    <SearchablePicker title={translate("editor.blockLinkBlockPickerTitle", { title: pickedNote.content.title || translate("sidebar.untitled") })}
      choices={blocks.map((block, index) => ({ id: String(index), label: block.text }))} emptyMessage={translate("editor.blockLinkNoBlocks")}
      onPick={(choiceId) => {
        const block = blocks[Number(choiceId)];
        // 選んでいるあいだに、ほかのデバイスの変更でブロックが消えていたら、何もしないで閉じる。
        if (!block || block.element._item === null || block.element._item.deleted) {
          onCancel();
          return;
        }
        onPick({ noteId: pickedNote.id, blockId: ensureBlockId(block.element) });
      }}
      onCancel={onCancel} />
  );
}

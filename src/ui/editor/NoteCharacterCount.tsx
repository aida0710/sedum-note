// 開いているメモの本文の文字数。文字を選んでいる間は、選んだ範囲の文字数も出す。

import { type Editor, useEditorState } from "@tiptap/react";
import { translate } from "../i18n/translate";
import { countCharacters, countDocumentCharacters } from "./characterCount";

export function NoteCharacterCount({ editor }: { editor: Editor }) {
  const counts = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const { doc, selection } = current.state;
      return {
        all: countDocumentCharacters(doc),
        selected: selection.empty ? 0 : countCharacters(doc.textBetween(selection.from, selection.to, "\n")),
      };
    },
  });
  const formatter = new Intl.NumberFormat();
  return (
    <span className="character-count">
      {counts.selected > 0
        ? translate("editor.selectedCharacterCount", { selected: formatter.format(counts.selected), count: formatter.format(counts.all) })
        : translate("editor.characterCount", { count: formatter.format(counts.all) })}
    </span>
  );
}

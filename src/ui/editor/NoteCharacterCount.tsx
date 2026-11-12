// 開いているメモの本文の文字数。文字を選んでいる間は、選んだ範囲の文字数も出す。

import { type Editor, useEditorState } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { translate } from "../i18n/translate";

// 改行と空白は数えない。絵文字などは見た目の 1 文字を 1 と数える。
const characterSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function countCharacters(text: string): number {
  let count = 0;
  for (const _character of characterSegmenter.segment(text.replace(/\s/g, ""))) {
    count += 1;
  }
  return count;
}

function textOf(doc: ProseMirrorNode, from: number, to: number): string {
  return doc.textBetween(from, to, "\n");
}

export function NoteCharacterCount({ editor }: { editor: Editor }) {
  const counts = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const { doc, selection } = current.state;
      return {
        all: countCharacters(textOf(doc, 0, doc.content.size)),
        selected: selection.empty ? 0 : countCharacters(textOf(doc, selection.from, selection.to)),
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

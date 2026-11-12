// 背景色を持てる、表のセルとヘッダーのセル。Markdown の表には書けないので、Markdown で書き出すと色は落ちる。

import { TableCell, TableHeader } from "@tiptap/extension-table";
import { colorNameFromAttribute, type EditorColorName, tintedBackground } from "./editorColors";

const backgroundColorAttribute = {
  backgroundColor: {
    default: null,
    parseHTML: (element: HTMLElement) => colorNameFromAttribute(element, "data-background-color"),
    renderHTML: ({ backgroundColor }: { backgroundColor: EditorColorName | null }) =>
      (backgroundColor ? { "data-background-color": backgroundColor, style: `background-color: ${tintedBackground(backgroundColor)}` } : {}),
  },
};

export const ColoredTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...backgroundColorAttribute };
  },
});

export const ColoredTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...backgroundColorAttribute };
  },
});

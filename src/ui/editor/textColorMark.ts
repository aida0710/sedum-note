// 文字色。Markdown には書けないので、Markdown で書き出すと色は落ちて文字だけが残る。

import { Mark } from "@tiptap/core";
import { colorNameFromAttribute, type EditorColorName, editorColorValue } from "./editorColors";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textColor: {
      setTextColor: (colorName: EditorColorName) => ReturnType;
      unsetTextColor: () => ReturnType;
    };
  }
}

export const TextColor = Mark.create({
  name: "textColor",
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => colorNameFromAttribute(element, "data-text-color"),
        renderHTML: ({ color }: { color: EditorColorName | null }) => (color ? { "data-text-color": color, style: `color: ${editorColorValue(color)}` } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-text-color]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
  addCommands() {
    return {
      setTextColor: (colorName) => ({ commands }) => commands.setMark(this.name, { color: colorName }),
      unsetTextColor: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
  renderMarkdown(node, helpers) {
    return helpers.renderChildren(node);
  },
});

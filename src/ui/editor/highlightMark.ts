// ハイライト（文字の背景色）。Markdown では ==文字== と往復する（Markdown に色は書けないので、取り込むと既定の色になる）。

import { Mark, markInputRule } from "@tiptap/core";
import { colorNameFromAttribute, type EditorColorName, tintedBackground } from "./editorColors";

export const DEFAULT_HIGHLIGHT_COLOR: EditorColorName = "yellow";
// 打っている途中の変換（==文字==）。「**太字**」などと同じく、行頭か空白のあとで始まり、= を中に含まないもの。
const HIGHLIGHT_TYPED = /(?:^|\s)(==(?!\s+==)([^=]+)==(?!\s+==))$/;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    highlight: {
      setHighlight: (colorName: EditorColorName) => ReturnType;
      unsetHighlight: () => ReturnType;
    };
  }
}

export const Highlight = Mark.create({
  name: "highlight",
  addAttributes() {
    return {
      color: {
        default: DEFAULT_HIGHLIGHT_COLOR,
        parseHTML: (element) => colorNameFromAttribute(element, "data-color") ?? DEFAULT_HIGHLIGHT_COLOR,
        renderHTML: ({ color }: { color: EditorColorName }) => ({ "data-color": color, style: `background-color: ${tintedBackground(color)}` }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "mark" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["mark", HTMLAttributes, 0];
  },
  addCommands() {
    return {
      setHighlight: (colorName) => ({ commands }) => commands.setMark(this.name, { color: colorName }),
      unsetHighlight: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
  addInputRules() {
    return [markInputRule({ find: HIGHLIGHT_TYPED, type: this.type })];
  },
  parseMarkdown(token, helpers) {
    return helpers.applyMark("highlight", helpers.parseInline(token.tokens || []));
  },
  renderMarkdown(node, helpers) {
    return `==${helpers.renderChildren(node)}==`;
  },
  markdownTokenizer: {
    name: "highlight",
    level: "inline",
    start(source: string) {
      return source.indexOf("==");
    },
    tokenize(source, _tokens, lexer) {
      const match = /^==(?!=)([\s\S]+?)==/.exec(source);
      if (!match?.[1]) {
        return undefined;
      }
      return { type: "highlight", raw: match[0], text: match[1], tokens: lexer.inlineTokens(match[1]) };
    },
  },
});

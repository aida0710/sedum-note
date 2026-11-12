// 段組み。ブロックを横に 2 段か 3 段に並べる。スマホの幅では縦に並ぶ（スタイルで切り替える）。
// Markdown には段組みが無いので、Markdown で書き出すと、左の段から順に上から並ぶ。

import { type JSONContent, Node } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

export const COLUMNS_NODE = "columns";
export const COLUMN_NODE = "column";
export const COLUMN_COUNTS = [2, 3] as const;
export type ColumnCount = (typeof COLUMN_COUNTS)[number];

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columns: {
      // 空の段を columnCount 個並べた段組みを入れる。
      insertColumns: (columnCount: ColumnCount) => ReturnType;
    };
  }
}

function emptyColumns(columnCount: ColumnCount): JSONContent {
  return { type: COLUMNS_NODE, content: Array.from({ length: columnCount }, () => ({ type: COLUMN_NODE, content: [{ type: "paragraph" }] })) };
}

export const Columns = Node.create({
  name: COLUMNS_NODE,
  group: "block",
  content: `${COLUMN_NODE}{2,3}`,
  defining: true,
  isolating: true,
  parseHTML() {
    return [{ tag: "div[data-columns]" }];
  },
  renderHTML({ node }) {
    return ["div", { "data-columns": String(node.childCount), class: "columns" }, 0];
  },
  addCommands() {
    return {
      insertColumns: (columnCount) => ({ chain }) => chain()
        .insertContent(emptyColumns(columnCount))
        // 入れた直後のカーソルは最後の段にあるので、左の段の先頭へ移す（左から書き始められるように）。
        .command(({ tr, dispatch }) => {
          const { $from } = tr.selection;
          for (let depth = $from.depth; depth > 0; depth -= 1) {
            if ($from.node(depth).type.name === COLUMNS_NODE) {
              dispatch?.(tr.setSelection(TextSelection.near(tr.doc.resolve($from.start(depth) + 1))));
              break;
            }
          }
          return true;
        })
        .run(),
    };
  },
  renderMarkdown: (node, helpers) => helpers.renderChildren(node.content ?? [], "\n\n"),
});

export const Column = Node.create({
  name: COLUMN_NODE,
  content: "block+",
  defining: true,
  isolating: true,
  parseHTML() {
    return [{ tag: "div[data-column]" }];
  },
  renderHTML() {
    return ["div", { "data-column": "", class: "column" }, 0];
  },
  renderMarkdown: (node, helpers) => helpers.renderChildren(node.content ?? [], "\n\n"),
});

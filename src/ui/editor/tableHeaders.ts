// カーソルのある表の、ヘッダー行・ヘッダー列が付いているかを読む。

import { findParentNode } from "@tiptap/core";
import type { Editor } from "@tiptap/react";

const HEADER_CELL = "tableHeader";

export type TableHeaders = { row: boolean; column: boolean };

export function tableHeadersAtSelection(editor: Editor): TableHeaders {
  const table = findParentNode((node) => node.type.name === "table")(editor.state.selection)?.node;
  if (!table) {
    return { row: false, column: false };
  }
  const firstRow = table.child(0);
  // 左上のセルは行と列の両方のヘッダーになるので、行は 2 列目、列は 2 行目で見分ける（1 列・1 行だけの表は左上で見る）。
  const cellOfHeaderRow = firstRow.child(Math.min(1, firstRow.childCount - 1));
  const cellOfHeaderColumn = table.child(Math.min(1, table.childCount - 1)).child(0);
  return { row: cellOfHeaderRow.type.name === HEADER_CELL, column: cellOfHeaderColumn.type.name === HEADER_CELL };
}

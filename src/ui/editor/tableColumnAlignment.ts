// 表の列の文字揃え。カーソルのある列（セルを選んでいれば、選んだ範囲の列）の全部のセルに同じ揃え方を付ける。
// Markdown の表は列ごとにしか揃え方を持てないので、セルごとではなく列ごとに付ける。

import type { Editor } from "@tiptap/react";
import { selectedRect } from "@tiptap/pm/tables";

export type ColumnAlignment = "left" | "center" | "right";

export function setColumnAlignment(editor: Editor, alignment: ColumnAlignment): boolean {
  return editor.chain().focus().command(({ state, tr, dispatch }) => {
    if (!editor.isActive("table")) {
      return false;
    }
    const { map, table, tableStart, left, right } = selectedRect(state);
    // 結合したセルは複数のマスを占めるので、同じセルを 2 回書き換えないように位置で数える。
    const cellPositions = new Set<number>();
    for (let row = 0; row < map.height; row += 1) {
      for (let column = left; column < right; column += 1) {
        cellPositions.add(map.map[row * map.width + column] as number);
      }
    }
    if (dispatch) {
      for (const cellPosition of cellPositions) {
        const cell = table.nodeAt(cellPosition);
        if (cell) {
          tr.setNodeMarkup(tableStart + cellPosition, null, { ...cell.attrs, align: alignment });
        }
      }
    }
    return true;
  }).run();
}

// カーソルのある列の揃え方。付いていなければ null。
export function columnAlignmentAtSelection(editor: Editor): ColumnAlignment | null {
  const attributes = editor.isActive("tableHeader") ? editor.getAttributes("tableHeader") : editor.getAttributes("tableCell");
  const alignment = attributes.align;
  return alignment === "left" || alignment === "center" || alignment === "right" ? alignment : null;
}

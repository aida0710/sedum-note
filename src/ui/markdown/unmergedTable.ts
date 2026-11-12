// 結合したセルのある表を、結合の無い表にする。Markdown の表は結合を表せないので、書き出す前に使う。
// 結合したセルの中身は左上のマスに残し、ほかのマスは空にする。

import type { JSONContent } from "@tiptap/core";

function emptyCell(type: string | undefined): JSONContent {
  return { type, content: [{ type: "paragraph" }] };
}

export function withoutMergedCells(table: JSONContent): JSONContent {
  const rows = table.content ?? [];
  // 上の行のセルが縦に伸びて占めているマス。行の番号 → 列の番号 → そのセルの種類。
  const cellTypesHeldFromAbove = new Map<number, Map<number, string | undefined>>();
  const unmergedRows = rows.map((row, rowIndex) => {
    const heldFromAbove = cellTypesHeldFromAbove.get(rowIndex) ?? new Map<number, string | undefined>();
    const cells: JSONContent[] = [];
    const fillCellsHeldFromAbove = () => {
      while (heldFromAbove.has(cells.length)) {
        cells.push(emptyCell(heldFromAbove.get(cells.length)));
      }
    };
    for (const cell of row.content ?? []) {
      fillCellsHeldFromAbove();
      const firstColumn = cells.length;
      const columnSpan = Number(cell.attrs?.colspan ?? 1);
      const rowSpan = Number(cell.attrs?.rowspan ?? 1);
      cells.push({ ...cell, attrs: { ...cell.attrs, colspan: 1, rowspan: 1 } });
      for (let column = 1; column < columnSpan; column += 1) {
        cells.push(emptyCell(cell.type));
      }
      for (let rowOffset = 1; rowOffset < rowSpan; rowOffset += 1) {
        const heldInLaterRow = cellTypesHeldFromAbove.get(rowIndex + rowOffset) ?? new Map<number, string | undefined>();
        for (let column = firstColumn; column < firstColumn + columnSpan; column += 1) {
          heldInLaterRow.set(column, cell.type);
        }
        cellTypesHeldFromAbove.set(rowIndex + rowOffset, heldInLaterRow);
      }
    }
    fillCellsHeldFromAbove();
    return { ...row, content: cells };
  });
  return { ...table, content: unmergedRows };
}

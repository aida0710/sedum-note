// 表の行・列の並びを変える: 1 つずつ動かす、列の値で行をソートする。どちらも表の中身を書き換える（同期される）。

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { moveTableColumn, moveTableRow, selectedRect, TableMap } from "@tiptap/pm/tables";
import type { Editor } from "@tiptap/react";

const HEADER_CELL = "tableHeader";

export type TableMoveDirection = "up" | "down" | "left" | "right";

// カーソルのある行（列）を、隣と入れ替える。端にあるときは false。
export function moveRowOrColumn(editor: Editor, direction: TableMoveDirection): boolean {
  if (!editor.isActive("table")) {
    return false;
  }
  const { top, left, map } = selectedRect(editor.state);
  const isRow = direction === "up" || direction === "down";
  const from = isRow ? top : left;
  const to = from + (direction === "up" || direction === "left" ? -1 : 1);
  if (to < 0 || to >= (isRow ? map.height : map.width)) {
    return false;
  }
  const move = isRow ? moveTableRow({ from, to }) : moveTableColumn({ from, to });
  return move(editor.state, editor.view.dispatch);
}

export type SortDirection = "ascending" | "descending";

function isHeaderRow(row: ProseMirrorNode): boolean {
  let allHeaders = true;
  row.forEach((cell) => { allHeaders &&= cell.type.name === HEADER_CELL; });
  return allHeaders;
}

function hasMergedCells(table: ProseMirrorNode): boolean {
  let merged = false;
  table.descendants((node) => {
    merged ||= Number(node.attrs.colspan ?? 1) > 1 || Number(node.attrs.rowspan ?? 1) > 1;
    return node.type.name === "table" || node.type.name === "tableRow";
  });
  return merged;
}

// 数として読める値どうしは数の大小で、それ以外は文字の順で比べる。空のセルは、どちらの向きでも最後に置く。
export function compareCellTexts(left: string, right: string, direction: SortDirection): number {
  const [leftText, rightText] = [left.trim(), right.trim()];
  if (leftText === "" || rightText === "") {
    return leftText === rightText ? 0 : leftText === "" ? 1 : -1;
  }
  const [leftNumber, rightNumber] = [Number(leftText.replace(/,/g, "")), Number(rightText.replace(/,/g, ""))];
  const ascending = Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
    ? leftNumber - rightNumber
    : leftText.localeCompare(rightText, undefined, { numeric: true });
  return direction === "ascending" ? ascending : -ascending;
}

// カーソルのある列の値で、行を並べ替える。ヘッダーの行は動かさない。結合したセルのある表は、行を入れ替えると形が崩れるので並べ替えない。
export function sortRowsByColumn(editor: Editor, direction: SortDirection): boolean {
  if (!editor.isActive("table")) {
    return false;
  }
  const { table, tableStart, left: column } = selectedRect(editor.state);
  if (hasMergedCells(table)) {
    return false;
  }
  const rows: ProseMirrorNode[] = [];
  table.forEach((row) => rows.push(row));
  const headerRowCount = rows.findIndex((row) => !isHeaderRow(row));
  const firstBodyRow = headerRowCount === -1 ? rows.length : headerRowCount;
  const cellText = (row: ProseMirrorNode) => row.child(Math.min(column, row.childCount - 1)).textContent;
  // 同じ値の行は元の順のままにする（sort は安定）。
  const sortedBodyRows = rows.slice(firstBodyRow).sort((leftRow, rightRow) => compareCellTexts(cellText(leftRow), cellText(rightRow), direction));
  const reordered = table.type.create(table.attrs, [...rows.slice(0, firstBodyRow), ...sortedBodyRows], table.marks);
  const tablePosition = tableStart - 1;
  editor.view.dispatch(editor.state.tr.replaceWith(tablePosition, tablePosition + table.nodeSize, reordered));
  return true;
}

export function canSortRows(editor: Editor): boolean {
  return editor.isActive("table") && !hasMergedCells(selectedRect(editor.state).table) && TableMap.get(selectedRect(editor.state).table).height > 1;
}

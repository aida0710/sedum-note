// データベース表示（ノートブックのメモを、プロパティを列にした表やボードで見せる）の、並べ方とまとめ方。

import type { PropertyDefinition, PropertyValue } from "./noteProperties";
import type { LiveNote } from "./noteRecords";

export const DATABASE_LAYOUTS = ["table", "board"] as const;
export type DatabaseLayout = (typeof DATABASE_LAYOUTS)[number];

// 並べ替えに使える、プロパティ以外の列。
export const TITLE_COLUMN = "title";
export const UPDATED_COLUMN = "updatedAt";

export type DatabaseView = {
  layout: DatabaseLayout;
  // 並べ替えに使う列（TITLE_COLUMN、UPDATED_COLUMN、プロパティの ID）。
  sortBy: string;
  sortDirection: "ascending" | "descending";
  // ボードで列を分けるプロパティ（選択肢の種類）の ID。null なら、最初の選択肢のプロパティ。
  groupBy: string | null;
};

export const DEFAULT_DATABASE_VIEW: DatabaseView = { layout: "table", sortBy: UPDATED_COLUMN, sortDirection: "descending", groupBy: null };

// 記録から読んだ値を確かめる。読めない項目は既定に戻す。
export function databaseViewFromField(stored: unknown): DatabaseView {
  const candidate = (typeof stored === "object" && stored !== null ? stored : {}) as Record<string, unknown>;
  return {
    layout: DATABASE_LAYOUTS.find((layout) => layout === candidate.layout) ?? DEFAULT_DATABASE_VIEW.layout,
    sortBy: typeof candidate.sortBy === "string" ? candidate.sortBy : DEFAULT_DATABASE_VIEW.sortBy,
    sortDirection: candidate.sortDirection === "ascending" ? "ascending" : candidate.sortDirection === "descending" ? "descending" : DEFAULT_DATABASE_VIEW.sortDirection,
    groupBy: typeof candidate.groupBy === "string" ? candidate.groupBy : null,
  };
}

function columnValue(note: LiveNote, column: string): PropertyValue {
  if (column === TITLE_COLUMN) {
    return note.content.title;
  }
  if (column === UPDATED_COLUMN) {
    return note.updatedAt;
  }
  return note.content.propertyValues[column] ?? null;
}

// 値の無いメモは、どちらの向きでも最後に置く。数は数の大小、ほかは文字の順で比べる。
export function sortNotesForDatabase(notes: LiveNote[], view: Pick<DatabaseView, "sortBy" | "sortDirection">): LiveNote[] {
  const direction = view.sortDirection === "ascending" ? 1 : -1;
  return [...notes].sort((left, right) => {
    const [leftValue, rightValue] = [columnValue(left, view.sortBy), columnValue(right, view.sortBy)];
    const [leftEmpty, rightEmpty] = [leftValue === null || leftValue === "", rightValue === null || rightValue === ""];
    if (leftEmpty || rightEmpty) {
      return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1;
    }
    const compared = typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true });
    return compared * direction;
  });
}

// ボードの列を分けるプロパティ。選んだものが無ければ（消された、種類が変わった）、最初の選択肢のプロパティ。
export function boardGroupProperty(properties: PropertyDefinition[], groupBy: string | null): PropertyDefinition | null {
  const selectProperties = properties.filter((property) => property.type === "select");
  return selectProperties.find((property) => property.id === groupBy) ?? selectProperties[0] ?? null;
}

export type BoardColumn = { option: string | null; notes: LiveNote[] };

// ボードの列。選択肢の順に並べ、値が無いか選択肢に無い値のメモは、最後の「未設定」の列（option が null）に入れる。
export function boardColumns(notes: LiveNote[], groupProperty: PropertyDefinition): BoardColumn[] {
  const columns: BoardColumn[] = groupProperty.options.map((option) => ({ option, notes: [] }));
  const unset: BoardColumn = { option: null, notes: [] };
  for (const note of notes) {
    const value = note.content.propertyValues[groupProperty.id];
    (columns.find((column) => column.option === value) ?? unset).notes.push(note);
  }
  return [...columns, unset];
}

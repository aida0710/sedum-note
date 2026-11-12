// メモのプロパティ（日付、状態、数などの項目）。プロパティの定義はノートブックが持ち、
// そのノートブックに入っているメモに値を付けられる。複数のノートブックに入っているメモは、それぞれの定義を合わせて持つ。

import type { LiveNote, LiveNotebook } from "./noteRecords";

export const PROPERTY_TYPES = ["text", "number", "date", "select", "checkbox"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export type PropertyDefinition = {
  id: string;
  name: string;
  type: PropertyType;
  // 種類が選択肢（select）のときの、選べる値。
  options: string[];
  // 並び順。小さいものが先。
  order: number;
};

// 種類ごとの値: 文字と選択肢は string、数は number、日付は YYYY-MM-DD の string、チェックは boolean。値が無ければ null。
export type PropertyValue = string | number | boolean | null;

// ノートブックの記録に定義を、メモの記録に値を書くときの、項目名の先頭。後ろにプロパティの ID が続く。
export const PROPERTY_DEFINITION_FIELD_PREFIX = "property:";
export const PROPERTY_VALUE_FIELD_PREFIX = "propertyValue:";

export function isPropertyType(value: unknown): value is PropertyType {
  return (PROPERTY_TYPES as readonly unknown[]).includes(value);
}

// 記録から読んだ定義を確かめる。読めない形（消した定義の印の null を含む）は null を返す。
export function propertyDefinitionFromField(id: string, stored: unknown): PropertyDefinition | null {
  if (typeof stored !== "object" || stored === null) {
    return null;
  }
  const { name, type, options, order } = stored as Record<string, unknown>;
  if (typeof name !== "string" || !isPropertyType(type)) {
    return null;
  }
  return { id, name, type, options: Array.isArray(options) ? options.filter((option) => typeof option === "string") : [], order: typeof order === "number" ? order : 0 };
}

// メモに付けられるプロパティ。入っているノートブックの定義を、ノートブックの並びのまま合わせる。
export function propertiesOfNote(note: LiveNote, notebooks: LiveNotebook[]): PropertyDefinition[] {
  return notebooks.filter((notebook) => note.content.notebookIds.includes(notebook.id)).flatMap((notebook) => notebook.content.properties);
}

// 値を、プロパティの種類に合う形にする。合わない値は null。
export function propertyValueOfType(type: PropertyType, value: unknown): PropertyValue {
  switch (type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    case "checkbox":
      return typeof value === "boolean" ? value : null;
    default:
      return typeof value === "string" && value !== "" ? value : null;
  }
}

// 文字で渡された値（Markdown の先頭の項目など）を、プロパティの種類に合う値にする。
export function propertyValueFromText(type: PropertyType, text: string): PropertyValue {
  if (type === "number") {
    return text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : null;
  }
  if (type === "checkbox") {
    return text === "true" ? true : text === "false" ? false : null;
  }
  return text === "" ? null : text;
}

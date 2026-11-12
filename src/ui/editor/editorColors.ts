// 本文で選べる色（ハイライト、文字色、表のセルの背景色）。色の値は、ノートブックの色と同じ組から取る。

import { NOTEBOOK_COLOR_CHOICES, type NotebookColorName } from "../shared/notebookAppearance";

export const EDITOR_COLOR_NAMES = ["yellow", "green", "blue", "pink", "purple", "orange", "red", "gray"] as const satisfies readonly NotebookColorName[];
export type EditorColorName = (typeof EDITOR_COLOR_NAMES)[number];

export function isEditorColorName(value: unknown): value is EditorColorName {
  return (EDITOR_COLOR_NAMES as readonly unknown[]).includes(value);
}

export function editorColorValue(colorName: EditorColorName): string {
  return NOTEBOOK_COLOR_CHOICES[colorName];
}

// 背景に使うときに色を薄める割合（%）。下の色が透けるので、ライトでもダークでも上の文字が読める。
const BACKGROUND_TINT_PERCENT = 35;

export function tintedBackground(colorName: EditorColorName): string {
  return `color-mix(in srgb, ${editorColorValue(colorName)} ${BACKGROUND_TINT_PERCENT}%, transparent)`;
}

// HTML の属性から色の名前を読む。一覧に無い値は、色なしとして扱う。
export function colorNameFromAttribute(element: HTMLElement, attributeName: string): EditorColorName | null {
  const value = element.getAttribute(attributeName);
  return isEditorColorName(value) ? value : null;
}

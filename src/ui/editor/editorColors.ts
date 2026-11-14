// 本文で選べる色（ハイライト、文字色、表のセルの背景色）。色の値は、ノートブックの色と同じ組（theme/paletteColors.ts）から取る。

import { PALETTE_COLORS, type PaletteColorName, paletteTextColorVariable } from "../theme/paletteColors";

export const EDITOR_COLOR_NAMES = ["yellow", "green", "blue", "pink", "purple", "orange", "red", "gray"] as const satisfies readonly PaletteColorName[];
export type EditorColorName = (typeof EDITOR_COLOR_NAMES)[number];

export function isEditorColorName(value: unknown): value is EditorColorName {
  return (EDITOR_COLOR_NAMES as readonly unknown[]).includes(value);
}

export function editorColorValue(colorName: EditorColorName): string {
  return PALETTE_COLORS[colorName];
}

// 文字色として使う値。テーマが地の上で読める濃さの値を入れる（theme/applyAppearance.ts）。テーマの無い所（書き出した HTML）では元の色。
export function editorTextColorValue(colorName: EditorColorName): string {
  return `var(${paletteTextColorVariable(colorName)}, ${editorColorValue(colorName)})`;
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

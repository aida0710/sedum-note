// テーマの色・本文の文字の大きさ・左の列の幅を、CSS の変数として画面に入れる。色の値はここからだけ入る
// （app.css は変数を使うだけで、テーマの色を持たない）。

import { applySystemBarColors } from "../platform/systemBars";
import type { EditorFontSize } from "../preferences/devicePreferences";
import { readableTextColorOn } from "./colorContrast";
import { THEME_COLOR_NAMES, type Theme, type ThemeColorName, type ThemeColors } from "./themeColors";

// 本文の文字の大きさ（px）。medium は書く画面の案 B（2026-11-13）の大きさで、案C の試作の 14.5px から上げた。
const EDITOR_FONT_SIZE_PIXELS: Record<EditorFontSize, number> = { small: 14, medium: 16, large: 18 };

// accentSoft → --accent-soft
function cssVariableName(colorName: ThemeColorName): string {
  return `--${colorName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

// 設定の見本のように、画面の一部だけを別のテーマで描くときにも使う。
export function themeCssVariables(colors: ThemeColors): Record<string, string> {
  const variables: Record<string, string> = {
    "--on-accent": readableTextColorOn(colors.accent),
    "--on-danger": readableTextColorOn(colors.danger),
  };
  for (const name of THEME_COLOR_NAMES) {
    variables[cssVariableName(name)] = colors[name];
  }
  return variables;
}

type Appearance = { theme: Theme; editorFontSize: EditorFontSize; sidebarWidth: number };

export function applyAppearance({ theme, editorFontSize, sidebarWidth }: Appearance): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeCssVariables(theme.colors))) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = theme.scheme;
  // スマホの組み方で画面の上下の端に来る色（メモの地）を、システムバーの所にも当てる。
  applySystemBarColors({ backgroundColor: theme.colors.panel, isDark: theme.scheme === "dark" });
  root.style.setProperty("--editor-font-size", `${EDITOR_FONT_SIZE_PIXELS[editorFontSize]}px`);
  root.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
}

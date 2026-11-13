// テーマの色・本文の文字の組み方（大きさ・字の間・行の間）・左の列の幅を、CSS の変数として画面に入れる。色の値はここからだけ入る
// （app.css は変数を使うだけで、テーマの色を持たない）。

import { applySystemBarColors } from "../platform/systemBars";
import type { EditorTypography } from "../preferences/editorTypography";
import { readableTextColorOn } from "./colorContrast";
import { THEME_COLOR_NAMES, type Theme, type ThemeColorName, type ThemeColors } from "./themeColors";

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

type Appearance = { theme: Theme; editorTypography: EditorTypography; sidebarWidth: number };

export function applyAppearance({ theme, editorTypography, sidebarWidth }: Appearance): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeCssVariables(theme.colors))) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = theme.scheme;
  // スマホの組み方で画面の上下の端に来る色（メモの地）を、システムバーの所にも当てる。
  applySystemBarColors({ backgroundColor: theme.colors.panel, isDark: theme.scheme === "dark" });
  root.style.setProperty("--editor-font-size", `${editorTypography.fontSize}px`);
  root.style.setProperty("--editor-letter-spacing", `${editorTypography.letterSpacing}em`);
  root.style.setProperty("--editor-line-height", String(editorTypography.lineHeight));
  root.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
}

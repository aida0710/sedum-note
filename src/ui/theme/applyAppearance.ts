// テーマの色・本文の文字の組み方（大きさ・字の間・行の間）・左の列の幅を、CSS の変数として画面に入れる。色の値はここからだけ入る
// （app.css は変数を使うだけで、テーマの色を持たない）。

import { applySystemBarColors } from "../platform/systemBars";
import type { EditorTypography } from "../preferences/editorTypography";
import { applyPrintColors } from "./printColors";
import type { Theme } from "./themeColors";
import { themeCssVariables } from "./themeCssVariables";

type Appearance = { theme: Theme; editorTypography: EditorTypography; sidebarWidth: number };

export function applyAppearance({ theme, editorTypography, sidebarWidth }: Appearance): void {
  applyPrintColors();
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeCssVariables(theme.colors))) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = theme.scheme;
  // 影の濃さなど、地の明るさで変える見た目を CSS が選べるようにする。
  root.dataset.scheme = theme.scheme;
  // スマホの組み方で画面の上下の端に来る色（メモの地）を、システムバーの所にも当てる。
  applySystemBarColors({ backgroundColor: theme.colors.panel, isDark: theme.scheme === "dark" });
  root.style.setProperty("--editor-font-size", `${editorTypography.fontSize}px`);
  root.style.setProperty("--editor-letter-spacing", `${editorTypography.letterSpacing}em`);
  root.style.setProperty("--editor-line-height", String(editorTypography.lineHeight));
  root.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
}

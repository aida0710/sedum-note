// 印刷（PDF での保存も同じ）で使う色。どのテーマを使っていても、白い紙の上で読める明るいテーマの色で刷る。
// テーマから作る色（本文の文字色、星の黄色など）も、この色から作り直す（暗いテーマ向けに明るくした色を、白い紙に刷らないため）。

import { LIGHT_THEME } from "./builtInThemes";
import type { ThemeColors } from "./themeColors";
import { themeCssVariables } from "./themeCssVariables";

const PRINT_COLORS_ELEMENT_ID = "sedum-note-print-colors";

// 紙では地を塗らないので、地の色はすべて白にする。補助の文字と線は、細い字でも刷って読める濃さにする。
const PRINT_THEME_COLORS: ThemeColors = {
  ...LIGHT_THEME.colors,
  canvas: "#ffffff", panel: "#ffffff", sidebar: "#ffffff", muted: "#57606a", line: "#d0d7de", tag: "#f3f4f6", accent: "#1f5fc4",
};

// 印刷のときだけ当たる CSS（@media print）として、色の変数を入れる。画面のテーマの変数は :root の style にあるので、!important で上書きする。
export function applyPrintColors(): void {
  if (document.getElementById(PRINT_COLORS_ELEMENT_ID)) {
    return;
  }
  const declarations = Object.entries(themeCssVariables(PRINT_THEME_COLORS)).map(([name, value]) => `${name}: ${value} !important;`);
  const css = `@media print { :root { ${declarations.join(" ")} color-scheme: light !important; } }`;
  document.head.appendChild(Object.assign(document.createElement("style"), { id: PRINT_COLORS_ELEMENT_ID, textContent: css }));
}

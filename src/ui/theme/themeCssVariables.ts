// テーマの色を、CSS の変数（--canvas、--accent-soft など）にする。テーマの色から作る色（浮いた面、塗りの上の文字、
// 星の黄色、本文の文字色）も、ここで作る。

import { colorWithContrast, NON_TEXT_CONTRAST_MINIMUM, readableTextColorOn, TEXT_CONTRAST_MINIMUM } from "./colorContrast";
import { BOOKMARK_BASE_COLOR, PALETTE_COLORS, type PaletteColorName, paletteTextColorVariable } from "./paletteColors";
import { raisedSurfaceColor } from "./raisedSurfaceColor";
import { THEME_COLOR_NAMES, type ThemeColorName, type ThemeColors } from "./themeColors";

// スイッチ（設定のオンとオフ）のつまみ。どのテーマでも白にして、オンの色の上でもオフの灰色の上でも、つまみと分かるようにする。
const SWITCH_KNOB_COLOR = "#ffffff";

// accentSoft → --accent-soft
function cssVariableName(colorName: ThemeColorName): string {
  return `--${colorName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

// 設定の見本のように、画面の一部だけを別のテーマで描くときにも使う。
export function themeCssVariables(colors: ThemeColors): Record<string, string> {
  // 黄色は明るい地では薄すぎるので、星の印として見分けられる濃さまで寄せる。
  const bookmark = colorWithContrast({ color: BOOKMARK_BASE_COLOR, background: colors.panel, towards: colors.text, minimum: NON_TEXT_CONTRAST_MINIMUM });
  const variables: Record<string, string> = {
    "--on-accent": readableTextColorOn(colors.accent),
    "--on-danger": readableTextColorOn(colors.danger),
    "--raised": raisedSurfaceColor(colors),
    "--bookmark": bookmark,
    "--on-bookmark": readableTextColorOn(bookmark),
    "--switch-knob": SWITCH_KNOB_COLOR,
  };
  for (const name of THEME_COLOR_NAMES) {
    variables[cssVariableName(name)] = colors[name];
  }
  // 本文の文字色は、選んだ色のまま地に置くと読めないことがある（明るい地の黄、暗い地の赤）。読める濃さに寄せる。
  for (const name of Object.keys(PALETTE_COLORS) as PaletteColorName[]) {
    variables[paletteTextColorVariable(name)] = colorWithContrast({ color: PALETTE_COLORS[name], background: colors.panel, towards: colors.text, minimum: TEXT_CONTRAST_MINIMUM });
  }
  return variables;
}

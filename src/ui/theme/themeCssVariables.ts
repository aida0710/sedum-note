// テーマの色を、CSS の変数（--canvas、--accent-soft など）にする。テーマの色から作る色（浮いた面、塗りの上の文字、
// 星の黄色、本文の文字色）も、ここで作る。

import { colorWithContrast, colorWithContrastOnAll, NON_TEXT_CONTRAST_MINIMUM, readableTextColorOn, TEXT_CONTRAST_MINIMUM } from "./colorContrast";
import { mixHexColors } from "./colorMixing";
import { BOOKMARK_BASE_COLOR, PALETTE_COLORS, type PaletteColorName, paletteTextColorVariable } from "./paletteColors";
import { raisedSurfaceColor } from "./raisedSurfaceColor";
import { THEME_COLOR_NAMES, type ThemeColorName, type ThemeColors } from "./themeColors";

// スイッチ（設定のオンとオフ）のつまみ。どのテーマでも白にして、オンの色の上でもオフの灰色の上でも、つまみと分かるようにする。
const SWITCH_KNOB_COLOR = "#ffffff";

// エラー・成功の知らせの帯（app.css の .form-error・.form-success）は、状態の色を地に 8% 混ぜた色。
export const STATUS_BAND_SHARE = 0.08;

// 文字に使う accent・danger・ok（--accent-text など）。テーマの色のまま文字にすると、載る地によっては 4.5:1 に届かない
// （2026-11-17 に、ライトの accent がサイドバーの地で 4.17、ダークのエラーの帯の文字が 4.46 だった）。
// 文字が載りうる地（本文・サイドバー・選んだ行・タグ・浮いた面・accentSoft、状態の帯）のどれの上でも読める濃さまで、文字の色へ寄せる。
function statusTextColors(colors: ThemeColors, raised: string): Record<string, string> {
  const surfaces = [colors.panel, colors.canvas, colors.sidebar, colors.selected, colors.tag, colors.accentSoft, raised];
  const readableOnSurfaces = (color: string, extraBackgrounds: readonly string[] = []) => colorWithContrastOnAll({
    color, backgrounds: [...surfaces, ...extraBackgrounds], towards: colors.text, minimum: TEXT_CONTRAST_MINIMUM,
  });
  const bandsOf = (color: string) => [colors.panel, raised].map((surface) => mixHexColors(surface, color, STATUS_BAND_SHARE));
  return {
    "--accent-text": readableOnSurfaces(colors.accent),
    "--danger-text": readableOnSurfaces(colors.danger, bandsOf(colors.danger)),
    "--ok-text": readableOnSurfaces(colors.ok, bandsOf(colors.ok)),
  };
}

// accentSoft → --accent-soft
function cssVariableName(colorName: ThemeColorName): string {
  return `--${colorName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

// 設定の見本のように、画面の一部だけを別のテーマで描くときにも使う。
export function themeCssVariables(colors: ThemeColors): Record<string, string> {
  // 黄色は明るい地では薄すぎるので、星の印として見分けられる濃さまで寄せる。
  const bookmark = colorWithContrast({ color: BOOKMARK_BASE_COLOR, background: colors.panel, towards: colors.text, minimum: NON_TEXT_CONTRAST_MINIMUM });
  const raised = raisedSurfaceColor(colors);
  const variables: Record<string, string> = {
    "--on-accent": readableTextColorOn(colors.accent),
    "--on-danger": readableTextColorOn(colors.danger),
    "--raised": raised,
    ...statusTextColors(colors, raised),
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

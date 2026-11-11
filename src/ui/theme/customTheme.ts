// 利用者が作るテーマ。色を自由に選べるが、文字が読めなくなる組み合わせは保存させない
// （読めないテーマを使うと、直すための設定の画面も読めなくなる）。

import { contrastRatio } from "./colorContrast";
import { isHexColor, THEME_COLOR_NAMES, type Theme, type ThemeColorName, type ThemeColors, type ThemeScheme } from "./themeColors";

export type CustomTheme = Theme & { name: string };

export const CUSTOM_THEME_NAME_MAX_LENGTH = 40;

// 本文の文字に要るコントラスト比（WCAG 2 の AA）。
const TEXT_CONTRAST_MINIMUM = 4.5;
// 補助の文字とアクセントの色に要るコントラスト比（大きな文字・部品の AA）。
const SECONDARY_CONTRAST_MINIMUM = 3;

type ContrastRule = { foreground: ThemeColorName; background: ThemeColorName; minimum: number };

const CONTRAST_RULES: ContrastRule[] = [
  { foreground: "text", background: "panel", minimum: TEXT_CONTRAST_MINIMUM },
  { foreground: "text", background: "sidebar", minimum: TEXT_CONTRAST_MINIMUM },
  { foreground: "text", background: "canvas", minimum: TEXT_CONTRAST_MINIMUM },
  { foreground: "muted", background: "panel", minimum: SECONDARY_CONTRAST_MINIMUM },
  { foreground: "muted", background: "sidebar", minimum: SECONDARY_CONTRAST_MINIMUM },
  { foreground: "accent", background: "panel", minimum: SECONDARY_CONTRAST_MINIMUM },
  { foreground: "danger", background: "panel", minimum: SECONDARY_CONTRAST_MINIMUM },
];

export type ContrastProblem = ContrastRule & { ratio: number };

export function findContrastProblems(colors: ThemeColors): ContrastProblem[] {
  return CONTRAST_RULES
    .map((rule) => ({ ...rule, ratio: contrastRatio(colors[rule.foreground], colors[rule.background]) }))
    .filter((checked) => checked.ratio < checked.minimum);
}

// 明るい地か暗い地かは、いちばん広い面（panel）の色で決める。
export function schemeOfColors(colors: ThemeColors): ThemeScheme {
  return contrastRatio(colors.panel, "#ffffff") < contrastRatio(colors.panel, "#000000") ? "light" : "dark";
}

// 保存してあった値を読むときに使う。形が違うものは捨てる。
export function parseStoredCustomTheme(stored: unknown): CustomTheme | null {
  if (typeof stored !== "object" || stored === null) {
    return null;
  }
  const candidate = stored as { id?: unknown; name?: unknown; colors?: unknown };
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string" || typeof candidate.colors !== "object" || candidate.colors === null) {
    return null;
  }
  const storedColors = candidate.colors as Record<string, unknown>;
  const colors = {} as ThemeColors;
  for (const name of THEME_COLOR_NAMES) {
    const color = storedColors[name];
    if (!isHexColor(color)) {
      return null;
    }
    colors[name] = color.toLowerCase();
  }
  if (findContrastProblems(colors).length > 0) {
    return null;
  }
  return { id: candidate.id, name: candidate.name.slice(0, CUSTOM_THEME_NAME_MAX_LENGTH), scheme: schemeOfColors(colors), colors };
}

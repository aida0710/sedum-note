// テーマが決める色の一覧。CSS では --canvas のような変数になる（applyAppearance.ts）。

export const THEME_COLOR_NAMES = [
  "canvas", "panel", "sidebar", "line", "text", "muted", "accent", "accentSoft", "selected", "tag", "ok", "danger",
] as const;
export type ThemeColorName = (typeof THEME_COLOR_NAMES)[number];
// 値は #rrggbb。
export type ThemeColors = Record<ThemeColorName, string>;

// 明るい地か暗い地か。スクロールバーや入力欄など、ブラウザが描く部品の色に使う。
export type ThemeScheme = "light" | "dark";

export type Theme = {
  id: string;
  scheme: ThemeScheme;
  colors: ThemeColors;
};

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value);
}

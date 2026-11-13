// 本文の文字の組み方（文字の大きさ・字の間・行の間）。このデバイスの表示の設定（devicePreferences.ts）に持ち、
// CSS の変数（--editor-font-size・--editor-letter-spacing・--editor-line-height）として本文に当てる（theme/applyAppearance.ts）。

export type EditorTypography = {
  // 文字の大きさ（px）。
  fontSize: number;
  // 字の間（em。文字の大きさに対する割合）。
  letterSpacing: number;
  // 行の間（文字の大きさの何倍の高さで 1 行にするか）。
  lineHeight: number;
};

// 選べる範囲と刻み。設定のつまみ（スライダー）にもこのまま使う。小さすぎ・詰めすぎで読めなくならない範囲にする。
export const EDITOR_TYPOGRAPHY_RANGES: Record<keyof EditorTypography, { minimum: number; maximum: number; step: number }> = {
  fontSize: { minimum: 12, maximum: 24, step: 1 },
  letterSpacing: { minimum: 0, maximum: 0.12, step: 0.01 },
  lineHeight: { minimum: 1.4, maximum: 2.4, step: 0.05 },
};

// 標準。書く画面の案 B（2026-11-13）で決めた値。
export const DEFAULT_EDITOR_TYPOGRAPHY: EditorTypography = { fontSize: 16, letterSpacing: 0.02, lineHeight: 1.85 };

// 範囲の中の、刻みに合った値にする。数でなければ標準の値。小数の刻みは、足し算の誤差を残さないよう丸める。
function settledValue(name: keyof EditorTypography, value: unknown): number {
  const { minimum, maximum, step } = EDITOR_TYPOGRAPHY_RANGES[name];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_EDITOR_TYPOGRAPHY[name];
  }
  const stepped = minimum + Math.round((Math.min(Math.max(value, minimum), maximum) - minimum) / step) * step;
  return Number(stepped.toFixed(4));
}

// 保存されていた値を読む。読めない項目だけを標準に戻す。
export function settledEditorTypography(stored: unknown): EditorTypography {
  const candidate = (typeof stored === "object" && stored !== null ? stored : {}) as Partial<Record<keyof EditorTypography, unknown>>;
  return {
    fontSize: settledValue("fontSize", candidate.fontSize),
    letterSpacing: settledValue("letterSpacing", candidate.letterSpacing),
    lineHeight: settledValue("lineHeight", candidate.lineHeight),
  };
}

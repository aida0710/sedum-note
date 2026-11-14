// 利用者が選べる色（ノートブックの色、本文の文字色・ハイライト・表のセルの色、手書きの線）。
// 値は、明るい地でも暗い地でも見分けやすい中くらいの明るさの色。文字に使うときは、地の上で読める濃さに寄せる（themeCssVariables）。

export const PALETTE_COLORS = {
  blue: "#2f6fde", orange: "#e07a3f", green: "#2da44e", purple: "#b55fd6", yellow: "#d4a017", pink: "#cf4f7a", cyan: "#1f9bb4",
  red: "#d1242f", teal: "#0f8f7a", brown: "#8a6240", gray: "#7a808a",
} as const;
export type PaletteColorName = keyof typeof PALETTE_COLORS;

// お気に入りの星、検索の当たり、注意のコールアウトの黄色の元の色。
export const BOOKMARK_BASE_COLOR = PALETTE_COLORS.yellow;

// 本文の文字色の CSS 変数の名前（--text-color-red など）。テーマごとに、地の上で読める濃さの値が入る。
export function paletteTextColorVariable(colorName: PaletteColorName): string {
  return `--text-color-${colorName}`;
}

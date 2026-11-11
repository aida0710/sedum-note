// 2 つの色のコントラスト比（WCAG 2 の式）。自作テーマが読める色かを確かめるのに使う。

const SRGB_LINEAR_THRESHOLD = 0.04045;

function channelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= SRGB_LINEAR_THRESHOLD ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hexColor: string): number {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  return 0.2126 * channelLuminance(red) + 0.7152 * channelLuminance(green) + 0.0722 * channelLuminance(blue);
}

// 1（同じ色）から 21（黒と白）。
export function contrastRatio(hexColor: string, otherHexColor: string): number {
  const [darker, lighter] = [relativeLuminance(hexColor), relativeLuminance(otherHexColor)].sort((left, right) => left - right);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

const WHITE = "#ffffff";
const NEAR_BLACK = "#16181c";

// 塗りの上に載せる文字の色（白か黒のうち、読みやすい方）。
export function readableTextColorOn(backgroundHexColor: string): string {
  return contrastRatio(WHITE, backgroundHexColor) >= contrastRatio(NEAR_BLACK, backgroundHexColor) ? WHITE : NEAR_BLACK;
}

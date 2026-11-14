// 2 つの色のコントラスト比（WCAG 2 の式）。自作テーマが読める色かを確かめるのに使う。

import { mixHexColors } from "./colorMixing";

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

// 文字に要るコントラスト比（WCAG 2 の AA）。
export const TEXT_CONTRAST_MINIMUM = 4.5;
// 大きな文字と、アイコンなど文字でない部品に要るコントラスト比（WCAG 2 の AA）。
export const NON_TEXT_CONTRAST_MINIMUM = 3;

// 色を地の上に置いたときのコントラストが minimum に届かなければ、towards（テーマの文字の色）へ少しずつ寄せる。
// 寄せる刻み。細かいほど元の色に近いまま届くが、5% で見た目の差は分からない。
const MIX_STEP = 0.05;

type ColorWithContrastInput = { color: string; background: string; towards: string; minimum: number };

export function colorWithContrast({ color, background, towards, minimum }: ColorWithContrastInput): string {
  for (let share = 0; share < 1; share += MIX_STEP) {
    const mixed = mixHexColors(color, towards, share);
    if (contrastRatio(mixed, background) >= minimum) {
      return mixed;
    }
  }
  return towards;
}

const WHITE = "#ffffff";
const NEAR_BLACK = "#16181c";

// 塗りの上に載せる文字の色（白か黒のうち、読みやすい方）。
export function readableTextColorOn(backgroundHexColor: string): string {
  return contrastRatio(WHITE, backgroundHexColor) >= contrastRatio(NEAR_BLACK, backgroundHexColor) ? WHITE : NEAR_BLACK;
}

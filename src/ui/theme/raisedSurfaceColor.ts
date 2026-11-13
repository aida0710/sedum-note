// メニューやダイアログのように、本文の上に浮く面の色。
// 明るいテーマでは、本文の地（panel）と同じ色でも影で浮いて見える。暗いテーマでは影が見えないので、
// 地より少し明るい色にして、後ろの本文と見分けられるようにする。

import { contrastRatio } from "./colorContrast";
import type { ThemeColors } from "./themeColors";

// 暗い地に混ぜる文字の色の割合。面の違いは分かるが、中の文字のコントラストはほとんど落ちない量。
const TEXT_SHARE_ON_DARK_PANEL = 0.07;

function mixHexColors(baseHexColor: string, mixedHexColor: string, mixedShare: number): string {
  const channels = [1, 3, 5].map((start) => {
    const base = Number.parseInt(baseHexColor.slice(start, start + 2), 16);
    const mixed = Number.parseInt(mixedHexColor.slice(start, start + 2), 16);
    return Math.round(base + (mixed - base) * mixedShare).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

export function raisedSurfaceColor(colors: ThemeColors): string {
  const isDarkPanel = contrastRatio(colors.panel, "#000000") < contrastRatio(colors.panel, "#ffffff");
  return isDarkPanel ? mixHexColors(colors.panel, colors.text, TEXT_SHARE_ON_DARK_PANEL) : colors.panel;
}

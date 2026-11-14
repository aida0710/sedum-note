// 2 つの色（#rrggbb）を混ぜる。

// mixedShare は、混ぜる色の割合（0 なら base のまま、1 なら mixed になる）。
export function mixHexColors(baseHexColor: string, mixedHexColor: string, mixedShare: number): string {
  const channels = [1, 3, 5].map((start) => {
    const base = Number.parseInt(baseHexColor.slice(start, start + 2), 16);
    const mixed = Number.parseInt(mixedHexColor.slice(start, start + 2), 16);
    return Math.round(base + (mixed - base) * mixedShare).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

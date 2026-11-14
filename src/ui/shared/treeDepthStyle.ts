// 木の形に並べる行（左の列、ノートブックを選ぶ一覧、目次）に、段の深さを渡す。字下げは、CSS が --depth から計算する
// （app.css の .sidebar-scroll、.notebook-choice、.outline-item）。字下げの幅を、CSS と TS の 2 か所に書かないため。

import type { CSSProperties } from "react";

// depth が null の行は、木の外の行（検索の結果）。字下げしない。
export function treeDepthStyle(depth: number | null): CSSProperties | undefined {
  return depth === null ? undefined : { "--depth": depth } as CSSProperties;
}

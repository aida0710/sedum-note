// ノートブックの色。作った順に色を割り当てるので、7 つまでは重ならず、どのデバイスでも同じ色になる
// （作った時刻は同期する）。色を選ぶ画面を作るまでの決め方。

import type { LiveNotebook } from "../../core/notes/noteRecords";

const NOTEBOOK_COLORS = ["#2f6fde", "#e07a3f", "#2da44e", "#b55fd6", "#d4a017", "#cf4f7a", "#1f9bb4"] as const;

export type NotebookColors = { colorOf: (notebookId: string) => string };

export function assignNotebookColors(notebooks: LiveNotebook[]): NotebookColors {
  const ordered = [...notebooks].sort((left, right) =>
    left.content.createdAt.localeCompare(right.content.createdAt) || left.id.localeCompare(right.id));
  const colors = new Map(ordered.map((notebook, index) => [notebook.id, NOTEBOOK_COLORS[index % NOTEBOOK_COLORS.length] ?? NOTEBOOK_COLORS[0]]));
  return { colorOf: (notebookId) => colors.get(notebookId) ?? NOTEBOOK_COLORS[0] };
}

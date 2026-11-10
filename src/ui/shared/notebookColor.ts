// ノートブックの色は ID から決める（色を選ぶ画面を作るまでの間、見分けられるように）。
const NOTEBOOK_COLORS = ["#2f6fde", "#e07a3f", "#2da44e", "#b55fd6", "#d4a017", "#cf4f7a", "#1f9bb4"] as const;

export function notebookColor(notebookId: string): string {
  const index = Number.parseInt(notebookId.slice(0, 6), 16) % NOTEBOOK_COLORS.length;
  return NOTEBOOK_COLORS[index] ?? NOTEBOOK_COLORS[0];
}

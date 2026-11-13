// 左の列で、いまドラッグしているもの（メモ。選んだ複数のメモのこともある。またはノートブック）と、落とし先として光らせる所。
// ドラッグの途中（dragover）では、ブラウザのドラッグのデータの中身を読めないので、画面の状態としても持つ。
// 元の行を薄くする、落とせない所を落とし先にしない、落とし先を 1 つだけ光らせる、をここから決める。

import { useSyncExternalStore } from "react";

export type SidebarDragged =
  // fromViewKey はドラッグを始めた一覧（viewKey）、fromNotebookId はそれがノートブックならその ID。
  | { kind: "notes"; noteIds: string[]; fromViewKey: string; fromNotebookId: string | null }
  | { kind: "notebook"; notebookId: string };

export type SidebarDragState = {
  dragged: SidebarDragged;
  // いま光らせている落とし先（一覧の viewKey など）。落とせない所の上では null。
  dropTargetKey: string | null;
};

let current: SidebarDragState | null = null;
const listeners = new Set<() => void>();

function publish(next: SidebarDragState | null): void {
  current = next;
  for (const listener of listeners) {
    listener();
  }
}

export function beginSidebarDrag(dragged: SidebarDragged): void {
  publish({ dragged, dropTargetKey: null });
  // 元の行が描き直しで消えると、その行の dragend は届かない。ドラッグの終わりは window で受ける。
  window.addEventListener("dragend", endSidebarDrag, { once: true });
}

export function endSidebarDrag(): void {
  if (current !== null) {
    publish(null);
  }
}

export function markSidebarDropTarget(key: string | null): void {
  if (current !== null && current.dropTargetKey !== key) {
    publish({ ...current, dropTargetKey: key });
  }
}

export function useSidebarDragState(): SidebarDragState | null {
  return useSyncExternalStore(subscribe, () => current);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

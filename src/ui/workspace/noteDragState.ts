// 左の列で、いまドラッグしているメモ（選んだ複数のメモのこともある）と、落とし先として光らせる一覧。
// ドラッグの途中（dragover）では、ブラウザのドラッグのデータの中身を読めないので、画面の状態としても持つ。
// 元の行を薄くする、元のノートブックを落とし先にしない、落とし先を 1 つだけ光らせる、をここから決める。

import { useSyncExternalStore } from "react";

export type DraggedNoteState = {
  noteIds: string[];
  // ドラッグを始めた一覧（viewKey）と、それがノートブックならその ID。
  fromViewKey: string;
  fromNotebookId: string | null;
  // いま光らせている落とし先の一覧（viewKey）。落とせない所の上では null。
  dropTargetKey: string | null;
};

let current: DraggedNoteState | null = null;
const listeners = new Set<() => void>();

function publish(next: DraggedNoteState | null): void {
  current = next;
  for (const listener of listeners) {
    listener();
  }
}

export function beginNoteDragState(dragged: Omit<DraggedNoteState, "dropTargetKey">): void {
  publish({ ...dragged, dropTargetKey: null });
  // 元の行が描き直しで消えると、その行の dragend は届かない。ドラッグの終わりは window で受ける。
  window.addEventListener("dragend", endNoteDragState, { once: true });
}

export function endNoteDragState(): void {
  if (current !== null) {
    publish(null);
  }
}

export function markNoteDropTarget(viewKey: string | null): void {
  if (current !== null && current.dropTargetKey !== viewKey) {
    publish({ ...current, dropTargetKey: viewKey });
  }
}

export function useNoteDragState(): DraggedNoteState | null {
  return useSyncExternalStore(subscribe, () => current);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

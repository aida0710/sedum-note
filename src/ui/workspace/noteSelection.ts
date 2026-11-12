// 左の列で、Ctrl（Mac では Command）か Shift を押しながら選んだメモ。選んだメモは、まとめてドラッグして
// ノートブックへ移したり、右クリックのメニューからまとめてゴミ箱に入れたりできる。メモを普通に押すと、選択は外れる。

import { useSyncExternalStore } from "react";

export type NoteSelection = {
  noteIds: string[];
  // Shift で範囲を選ぶときの起点（最後に Ctrl か普通に押したメモ）。
  anchorId: string | null;
};

// 押したメモが並んでいる一覧の、上から順のメモと、いま開いているメモ。
export type NoteSelectionContext = { orderedIds: string[]; openNoteId: string | null };

const EMPTY_SELECTION: NoteSelection = { noteIds: [], anchorId: null };

let current: NoteSelection = EMPTY_SELECTION;
const listeners = new Set<() => void>();

function publish(next: NoteSelection): void {
  current = next;
  for (const listener of listeners) {
    listener();
  }
}

// 同じ一覧で開いているメモ。開いているメモに足していく操作として、最初の Ctrl と Shift で一緒に選ぶ。
// ほかの一覧で開いているメモは、見えない所でまとめて動かさないよう含めない。
function openNoteInList({ orderedIds, openNoteId }: NoteSelectionContext): string | null {
  return openNoteId !== null && orderedIds.includes(openNoteId) ? openNoteId : null;
}

export function toggleNoteSelection(noteId: string, context: NoteSelectionContext): void {
  const openNoteId = openNoteInList(context);
  const base = current.noteIds.length === 0 && openNoteId !== null && openNoteId !== noteId ? [openNoteId] : current.noteIds;
  const noteIds = base.includes(noteId) ? base.filter((id) => id !== noteId) : [...base, noteId];
  publish({ noteIds, anchorId: noteId });
}

// 起点から noteId までを、一覧に並んでいる順で選ぶ。起点がこの一覧に無ければ、開いているメモを起点にする。
export function selectNoteRange(noteId: string, context: NoteSelectionContext): void {
  const { orderedIds } = context;
  const anchorId = current.anchorId !== null && orderedIds.includes(current.anchorId) ? current.anchorId : openNoteInList(context);
  const from = anchorId === null ? -1 : orderedIds.indexOf(anchorId);
  const to = orderedIds.indexOf(noteId);
  if (from === -1 || to === -1) {
    publish({ noteIds: [noteId], anchorId: noteId });
    return;
  }
  publish({ noteIds: orderedIds.slice(Math.min(from, to), Math.max(from, to) + 1), anchorId });
}

// 普通に押したとき。選択を外し、押したメモを次の Shift の起点にする。
export function resetNoteSelection(anchorId: string | null = null): void {
  if (current.noteIds.length > 0 || current.anchorId !== anchorId) {
    publish({ noteIds: [], anchorId });
  }
}

// 描画の外（ドラッグを始めたときなど）で読む。
export function readNoteSelection(): NoteSelection {
  return current;
}

export function useNoteSelection(): NoteSelection {
  return useSyncExternalStore(subscribe, () => current);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

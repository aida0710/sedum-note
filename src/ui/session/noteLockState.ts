// ロックしたメモ（core/notes/noteLock.ts）のうち、いま中身を隠しているものを、画面の部品に渡す。

import { createContext, useContext, useMemo } from "react";
import { concealSummary, lockedNoteIds } from "../../core/notes/noteLock";
import type { RepositorySnapshot } from "./useRepositorySnapshot";

export type NoteLockState = {
  // ロックされているメモ（一覧に鍵の印を出す）。
  lockedNoteIds: ReadonlySet<string>;
  // そのうち、パスフレーズを確かめていないもの。題のほかは画面に出さない。
  concealedNoteIds: ReadonlySet<string>;
};

const NO_LOCKED_NOTES: NoteLockState = { lockedNoteIds: new Set(), concealedNoteIds: new Set() };

export const NoteLockStateContext = createContext<NoteLockState>(NO_LOCKED_NOTES);

export function useNoteLockState(): NoteLockState {
  return useContext(NoteLockStateContext);
}

// 隠しているメモの要約から、本文に由来するものを抜いたスナップショットにする。一覧・検索・グラフ・クエリは、
// このスナップショットの要約を読むので、題だけを出すことになる。
export function useSnapshotWithLocks(snapshot: RepositorySnapshot, revealedNoteIds: ReadonlySet<string>): { snapshot: RepositorySnapshot; lockState: NoteLockState } {
  return useMemo(() => {
    const locked = lockedNoteIds(snapshot.notes, snapshot.notebooks);
    const concealedNoteIds = new Set([...locked].filter((noteId) => !revealedNoteIds.has(noteId)));
    const summaries = concealedNoteIds.size === 0
      ? snapshot.summaries
      : snapshot.summaries.map((summary) => (concealedNoteIds.has(summary.note.id) ? concealSummary(summary) : summary));
    return { snapshot: { ...snapshot, summaries }, lockState: { lockedNoteIds: locked, concealedNoteIds } };
  }, [snapshot, revealedNoteIds]);
}

// NoteRepository の中身を React の描画に渡す。変更の知らせごとに一覧を作り直す。

import { useMemo, useSyncExternalStore } from "react";
import type { LiveNote, LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { type NoteSummary, summarizeNote } from "../../core/notes/noteQueries";

export type RepositorySnapshot = {
  notes: LiveNote[];
  summaries: NoteSummary[];
  notebooks: LiveNotebook[];
  unreadableCount: number;
};

export function useRepositorySnapshot(repository: NoteRepository): RepositorySnapshot {
  const store = useMemo(() => {
    let snapshot = takeSnapshot(repository);
    return {
      subscribe: (onChange: () => void) =>
        repository.subscribe(() => {
          snapshot = takeSnapshot(repository);
          onChange();
        }),
      getSnapshot: () => snapshot,
    };
  }, [repository]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

function takeSnapshot(repository: NoteRepository): RepositorySnapshot {
  const notes = repository.notes();
  return {
    notes,
    summaries: notes.map(summarizeNote),
    notebooks: repository.notebooks(),
    unreadableCount: repository.unreadableIds().length,
  };
}

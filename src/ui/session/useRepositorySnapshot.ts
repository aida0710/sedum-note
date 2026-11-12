// NoteRepository の中身を React の描画に渡す。変更の知らせごとに一覧を作り直す。

import { createContext, useMemo, useSyncExternalStore } from "react";
import type { LiveNote, LiveNotebook, LiveSavedSearch } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { type NoteSummary, summarizeNote } from "../../core/notes/noteQueries";

export type RepositorySnapshot = {
  notes: LiveNote[];
  summaries: NoteSummary[];
  notebooks: LiveNotebook[];
  savedSearches: LiveSavedSearch[];
  unreadableCount: number;
  // まだ同期先へ送っていない記録の ID。
  unsyncedIds: ReadonlySet<string>;
};

// 未送信の印を、一覧の行やエディタから読むためのもの。同期を設定していないときは空。
export const UnsyncedRecordsContext = createContext<ReadonlySet<string>>(new Set());

export function useRepositorySnapshot(repository: NoteRepository): RepositorySnapshot {
  const store = useMemo(() => {
    // 本文から平文を取り出すのは重いので、中身が変わったメモだけ作り直す。
    const summaryCache = new Map<string, NoteSummary>();
    const takeSnapshot = (): RepositorySnapshot => {
      const notes = repository.notes();
      const summaries = notes.map((note) => {
        const cached = summaryCache.get(note.id);
        const summary = cached?.note.revision === note.revision ? cached : summarizeNote(note);
        summaryCache.set(note.id, summary);
        return summary;
      });
      return {
        notes,
        summaries,
        notebooks: repository.notebooks(),
        savedSearches: repository.savedSearches(),
        unreadableCount: repository.unreadableIds().length,
        unsyncedIds: repository.unsyncedIds(),
      };
    };
    let snapshot = takeSnapshot();
    return {
      subscribe: (onChange: () => void) =>
        repository.subscribe(() => {
          snapshot = takeSnapshot();
          onChange();
        }),
      getSnapshot: () => snapshot,
    };
  }, [repository]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

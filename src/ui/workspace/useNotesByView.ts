// 左の列が、一覧ごとのメモを引く関数。スナップショットが変わるたびに、変わったメモが入る一覧だけを絞り込み直す（notesByViewCache.ts）。

import { useMemo, useState } from "react";
import type { NoteSortOrder, NoteSummary, NoteView } from "../../core/notes/noteQueries";
import { NotesByViewCache } from "./notesByViewCache";

export type NotesInView = (view: NoteView) => NoteSummary[];

export function useNotesByView(summaries: NoteSummary[], sortOrder: NoteSortOrder): NotesInView {
  const [cache] = useState(() => new NotesByViewCache());
  return useMemo(() => {
    cache.update(summaries, sortOrder);
    return (view: NoteView) => cache.notesIn(view);
  }, [cache, summaries, sortOrder]);
}

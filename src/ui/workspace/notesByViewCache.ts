// 左の列の一覧ごとのメモ（selectNotes の結果）を、スナップショットをまたいで使い回す。
// 本文を 1 文字打つたびにスナップショットは新しくなるが、変わるのは打っているメモ 1 件だけなので、一覧ごとに全部のメモを
// 絞り込み直すと、一覧の数 × メモの数の手間が打つたびにかかる（メモ 2,000 件・一覧 45 個で、1 文字ごとに十数 ms）。
// 変わったメモ（新しい形と前の形）が入る一覧だけを作り直し、ほかの一覧は前の結果をそのまま返す。
// 前提: 変わっていないメモの NoteSummary は、スナップショットをまたいで同じ入れ物（useRepositorySnapshot が版ごとに使い回す）。

import { type NoteSortOrder, type NoteSummary, type NoteView, selectNotes } from "../../core/notes/noteQueries";
import { viewKey } from "./useWorkspaceNavigation";

type CachedView = { view: NoteView; notes: NoteSummary[] };

export class NotesByViewCache {
  #summaries: NoteSummary[] = [];
  #sortOrder: NoteSortOrder | null = null;
  #cachedViews = new Map<string, CachedView>();

  // 新しいスナップショットのメモと並び順を受け取る。並び順が変わったら全部、メモが変わったら、そのメモが入る一覧だけを捨てる。
  update(summaries: NoteSummary[], sortOrder: NoteSortOrder): void {
    if (summaries === this.#summaries && sortOrder === this.#sortOrder) {
      return;
    }
    if (sortOrder !== this.#sortOrder) {
      this.#cachedViews.clear();
    } else {
      this.#forgetViewsContaining(changedSummaries(this.#summaries, summaries));
    }
    this.#summaries = summaries;
    this.#sortOrder = sortOrder;
  }

  notesIn(view: NoteView): NoteSummary[] {
    const key = viewKey(view);
    const cached = this.#cachedViews.get(key);
    if (cached) {
      return cached.notes;
    }
    const notes = selectNotes(this.#summaries, { view, sortOrder: this.#sortOrder ?? undefined });
    this.#cachedViews.set(key, { view, notes });
    return notes;
  }

  #forgetViewsContaining(changed: NoteSummary[]): void {
    if (changed.length === 0) {
      return;
    }
    for (const [key, { view }] of this.#cachedViews) {
      if (selectNotes(changed, { view }).length > 0) {
        this.#cachedViews.delete(key);
      }
    }
  }
}

// 片方にだけある NoteSummary（足された・消えた・中身が変わったメモの、新しい形と前の形）。
function changedSummaries(previous: NoteSummary[], next: NoteSummary[]): NoteSummary[] {
  const previousSet = new Set(previous);
  const nextSet = new Set(next);
  return [...next.filter((summary) => !previousSet.has(summary)), ...previous.filter((summary) => !nextSet.has(summary))];
}

// 試験で使う、メモの項目の見本。指定しない項目は、新しく作ったメモと同じ値にする。

import type { NoteContent } from "./noteRecords";

export function noteContentFixture(overrides: Partial<NoteContent> & Pick<NoteContent, "createdAt">): NoteContent {
  return {
    title: "", notebookIds: [], pinned: false, bookmarked: false, trashedAt: null, isTemplate: false, isOutline: false, isLocked: false, dueAt: null, pageAlignment: null,
    attachments: [], propertyValues: {}, ...overrides,
  };
}

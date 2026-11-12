// デイリーノート（その日のメモ）。今日の日付を題にしたメモがあれば開き、無ければ作る。

import type { LiveNote } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { formatIsoDate, formatLongDate } from "../shared/formatTime";

export const DAILY_NOTE_TITLE_FORMATS = ["iso", "long"] as const;
export type DailyNoteTitleFormat = (typeof DAILY_NOTE_TITLE_FORMATS)[number];

// iso は 2026-11-12（並べ替えても日付の順になる）、long は画面の言語の書き方（2026年11月12日）。
export function dailyNoteTitle(format: DailyNoteTitleFormat, now: Date, language: string): string {
  return format === "long" ? formatLongDate(now, language) : formatIsoDate(now);
}

type DailyNoteInput = {
  repository: NoteRepository;
  title: string;
  // 新しく作るときに入れるノートブック。null か、もう無いノートブックなら、どこにも入れない。
  notebookId: string | null;
};

export async function findOrCreateDailyNote({ repository, title, notebookId }: DailyNoteInput): Promise<LiveNote> {
  const existing = repository.notes().find((note) => note.content.trashedAt === null && !note.content.isTemplate && note.content.title === title);
  if (existing) {
    return existing;
  }
  const notebookExists = repository.notebooks().some((notebook) => notebook.id === notebookId);
  return repository.createNote({ title, notebookIds: notebookId !== null && notebookExists ? [notebookId] : [] });
}

import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { appendParagraph } from "../../core/notes/bodyFixtures";
import { noteContentFixture } from "../../core/notes/noteFixtures";
import type { LiveNote } from "../../core/notes/noteRecords";
import { type NoteSummary, selectNotes, summarizeNote } from "../../core/notes/noteQueries";
import { NotesByViewCache } from "./notesByViewCache";

function summary(id: string, overrides: Partial<LiveNote["content"]>, updatedAt: string, bodyText = ""): NoteSummary {
  const body = new Y.Doc().getXmlFragment("body");
  appendParagraph(body, bodyText);
  return summarizeNote({ id, kind: "note", updatedAt, revision: 0, body, content: noteContentFixture({ createdAt: updatedAt, ...overrides }) });
}

const ALL = { kind: "all" } as const;
const NOTEBOOK = { kind: "notebook", notebookId: "n1" } as const;
const TAG = { kind: "tag", tag: "todo" } as const;
const TRASH = { kind: "trash" } as const;

const first = [
  summary("a", { title: "a" }, "2026-11-01T00:00:00Z", "#todo"),
  summary("b", { title: "b", notebookIds: ["n1"] }, "2026-11-02T00:00:00Z"),
  summary("c", { title: "c" }, "2026-11-03T00:00:00Z"),
];

function cacheWith(summaries: NoteSummary[]): NotesByViewCache {
  const cache = new NotesByViewCache();
  cache.update(summaries, "updatedAt");
  return cache;
}

describe("一覧ごとのメモの使い回し", () => {
  it("メモが変わっても、そのメモが入らない一覧は前と同じ結果（同じ配列）を返す", () => {
    const cache = cacheWith(first);
    const notebookBefore = cache.notesIn(NOTEBOOK);
    const tagBefore = cache.notesIn(TAG);
    const allBefore = cache.notesIn(ALL);
    // c の本文を打った（新しい版の NoteSummary に入れ替わった）。
    cache.update([first[0]!, first[1]!, summary("c", { title: "c" }, "2026-11-04T00:00:00Z", "打った")], "updatedAt");
    expect(cache.notesIn(NOTEBOOK)).toBe(notebookBefore);
    expect(cache.notesIn(TAG)).toBe(tagBefore);
    expect(cache.notesIn(ALL)).not.toBe(allBefore);
  });

  it("作り直した一覧も使い回した一覧も、全部を絞り込み直したときと同じ中身になる", () => {
    const cache = cacheWith(first);
    for (const view of [ALL, NOTEBOOK, TAG, TRASH]) {
      cache.notesIn(view);
    }
    // a をノートブックへ移してタグを外し、b をゴミ箱へ入れ、d を足した。
    const next = [
      summary("a", { title: "a", notebookIds: ["n1"] }, "2026-11-05T00:00:00Z"),
      summary("b", { title: "b", notebookIds: ["n1"], trashedAt: "2026-11-05T00:00:00Z" }, "2026-11-05T00:00:00Z"),
      first[2]!,
      summary("d", { title: "d" }, "2026-11-06T00:00:00Z", "#todo"),
    ];
    cache.update(next, "updatedAt");
    for (const view of [ALL, NOTEBOOK, TAG, TRASH]) {
      expect(cache.notesIn(view)).toEqual(selectNotes(next, { view, sortOrder: "updatedAt" }));
    }
  });

  it("メモが消えたら、そのメモが入っていた一覧から消える", () => {
    const cache = cacheWith(first);
    expect(cache.notesIn(NOTEBOOK).map(({ note }) => note.id)).toEqual(["b"]);
    cache.update([first[0]!, first[2]!], "updatedAt");
    expect(cache.notesIn(NOTEBOOK)).toEqual([]);
  });

  it("並び順を変えたら、全部の一覧をその順に並べ直す", () => {
    const cache = cacheWith(first);
    expect(cache.notesIn(ALL).map(({ note }) => note.id)).toEqual(["c", "b", "a"]);
    cache.update(first, "updatedAtOldestFirst");
    expect(cache.notesIn(ALL).map(({ note }) => note.id)).toEqual(["a", "b", "c"]);
  });
});

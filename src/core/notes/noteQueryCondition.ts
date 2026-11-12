// クエリのブロック（本文の中に、条件に合うメモの一覧を出す）の条件と、条件に合うメモの選び方。

import { type NoteSummary, type NoteView, selectNotes } from "./noteQueries";

export type NoteQueryCondition = {
  // 探す範囲。どちらも null なら、すべてのメモ。両方あれば、ノートブックの中でタグの付いたメモ。
  notebookId: string | null;
  tag: string | null;
  // 本文か題に含まれる言葉（空白で区切ると、全部を含むメモ）。
  searchText: string;
  // プロパティの値での絞り込み。propertyId が null なら絞らない。値は文字にして比べる。
  propertyId: string | null;
  propertyValue: string;
};

export const EMPTY_NOTE_QUERY: NoteQueryCondition = { notebookId: null, tag: null, searchText: "", propertyId: null, propertyValue: "" };

// 記録や Markdown から読んだ値を確かめる。読めない項目は、絞らない値に戻す。
export function noteQueryConditionFrom(stored: unknown): NoteQueryCondition {
  const candidate = (typeof stored === "object" && stored !== null ? stored : {}) as Record<string, unknown>;
  const textOrNull = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);
  return {
    notebookId: textOrNull(candidate.notebookId),
    tag: textOrNull(candidate.tag),
    searchText: typeof candidate.searchText === "string" ? candidate.searchText : "",
    propertyId: textOrNull(candidate.propertyId),
    propertyValue: typeof candidate.propertyValue === "string" ? candidate.propertyValue : "",
  };
}

// 条件に合うメモ（ゴミ箱とテンプレートを除く）。更新の新しい順。
export function notesMatchingQuery(summaries: NoteSummary[], condition: NoteQueryCondition): NoteSummary[] {
  const view: NoteView = condition.notebookId !== null ? { kind: "notebook", notebookId: condition.notebookId } : condition.tag !== null ? { kind: "tag", tag: condition.tag } : { kind: "all" };
  return selectNotes(summaries, { view, searchText: condition.searchText })
    .filter((summary) => condition.notebookId === null || condition.tag === null || summary.tags.includes(condition.tag))
    .filter((summary) => condition.propertyId === null || String(summary.note.content.propertyValues[condition.propertyId] ?? "") === condition.propertyValue);
}

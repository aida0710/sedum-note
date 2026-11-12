// 画面に並べるメモの絞り込みと並べ替え。画面の部品から切り離して試験できるようにする。

import { bodyLinkedNoteIds, bodyPlainText, plainTextHashtags } from "./bodyText";
import { bodyDueTasks, type DueTask } from "./dueTasks";
import { matchesNoteSearch, parseNoteSearchQuery } from "./noteSearchQuery";
import type { LiveNote, LiveNotebook } from "./noteRecords";

export type NoteView =
  | { kind: "all" }
  | { kind: "bookmarked" }
  | { kind: "notebook"; notebookId: string }
  | { kind: "tag"; tag: string }
  | { kind: "templates" }
  | { kind: "trash" };

export type NoteSummary = {
  note: LiveNote;
  plainText: string;
  tags: string[];
  // 本文の中のリンクが指す、ほかのメモの ID。
  linkedNoteIds: string[];
  // 本文の、期限の印が付いたチェックリストの項目。
  dueTasks: DueTask[];
};

export function summarizeNote(note: LiveNote): NoteSummary {
  const plainText = bodyPlainText(note.body);
  return { note, plainText, tags: plainTextHashtags(plainText), linkedNoteIds: bodyLinkedNoteIds(note.body), dueTasks: bodyDueTasks(note.body) };
}

// noteId のメモにリンクしているメモ（バックリンク）。ゴミ箱のメモは除く。新しく更新した順。
export function notesLinkingTo(summaries: NoteSummary[], noteId: string): LiveNote[] {
  return summaries
    .filter((summary) => summary.note.id !== noteId && summary.note.content.trashedAt === null && summary.linkedNoteIds.includes(noteId))
    .map((summary) => summary.note)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function belongsToView(summary: NoteSummary, view: NoteView): boolean {
  const { content } = summary.note;
  if (view.kind === "trash") {
    return content.trashedAt !== null;
  }
  if (content.trashedAt !== null) {
    return false;
  }
  // テンプレートは「テンプレート」にだけ並べる。
  if (content.isTemplate !== (view.kind === "templates")) {
    return false;
  }
  switch (view.kind) {
    case "all":
    case "templates":
      return true;
    case "bookmarked":
      return content.bookmarked;
    case "notebook":
      return content.notebookIds.includes(view.notebookId);
    case "tag":
      return summary.tags.includes(view.tag);
  }
}


export const NOTE_SORT_ORDERS = ["updatedAt", "createdAt", "title"] as const;
// 一覧の並び順。updatedAt と createdAt は新しい順、title は名前の順。
export type NoteSortOrder = (typeof NOTE_SORT_ORDERS)[number];

function compareBySortOrder(left: LiveNote, right: LiveNote, sortOrder: NoteSortOrder): number {
  switch (sortOrder) {
    case "updatedAt":
      return right.updatedAt.localeCompare(left.updatedAt);
    case "createdAt":
      return right.content.createdAt.localeCompare(left.content.createdAt);
    case "title":
      // 数字は大きさで比べる（「メモ2」を「メモ10」の前に置く）。同じ名前は新しく変えた順。
      return left.content.title.localeCompare(right.content.title, undefined, { numeric: true }) ||
        right.updatedAt.localeCompare(left.updatedAt);
  }
}

export type NoteSelection = {
  view: NoteView;
  // 検索の言葉。#タグ や notebook:名前 の絞り込みも書ける（noteSearchQuery.ts）。
  searchText?: string;
  sortOrder?: NoteSortOrder;
  // notebook:名前 の絞り込みで、ノートブックの ID から名前を引く。渡さなければ、notebook: に当たるメモは無い。
  notebookNameOf?: (notebookId: string) => string | undefined;
};

// ノートブックの一覧から、ID で名前を引く関数を作る（selectNotes の notebookNameOf に渡す）。
export function notebookNameLookup(notebooks: Array<{ id: string; content: { name: string } }>): (notebookId: string) => string | undefined {
  const names = new Map(notebooks.map((notebook) => [notebook.id, notebook.content.name]));
  return (notebookId) => names.get(notebookId);
}

// ピン留めを先に、残りは選んだ並び順で返す。
export function selectNotes(summaries: NoteSummary[], { view, searchText = "", sortOrder = "updatedAt", notebookNameOf = () => undefined }: NoteSelection): NoteSummary[] {
  const query = parseNoteSearchQuery(searchText);
  return summaries
    .filter((summary) => belongsToView(summary, view) && matchesNoteSearch({
      title: summary.note.content.title, plainText: summary.plainText, tags: summary.tags, notebookIds: summary.note.content.notebookIds,
    }, query, notebookNameOf))
    .sort((left, right) => {
      if (left.note.content.pinned !== right.note.content.pinned) {
        return left.note.content.pinned ? -1 : 1;
      }
      return compareBySortOrder(left.note, right.note, sortOrder);
    });
}

export function countTags(summaries: NoteSummary[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const summary of summaries) {
    if (summary.note.content.trashedAt !== null || summary.note.content.isTemplate) {
      continue;
    }
    for (const tag of summary.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((left, right) => left.tag.localeCompare(right.tag));
}

export type NotebookTreeNode = { notebook: LiveNotebook; children: NotebookTreeNode[] };

// 親の無い（または消えた親を指す）ノートブックを最上位にして、名前の順に並べる。
export function buildNotebookTree(notebooks: LiveNotebook[]): NotebookTreeNode[] {
  const ids = new Set(notebooks.map((notebook) => notebook.id));
  const nodes = new Map(notebooks.map((notebook) => [notebook.id, { notebook, children: [] as NotebookTreeNode[] }]));
  const roots: NotebookTreeNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.notebook.content.parentId;
    const parent = parentId !== null && ids.has(parentId) && parentId !== node.notebook.id ? nodes.get(parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  const sortByName = (list: NotebookTreeNode[]) => {
    // 言語は決め打ちにせず、動かしている環境の並び順に任せる。
    list.sort((left, right) => left.notebook.content.name.localeCompare(right.notebook.content.name));
    list.forEach((node) => sortByName(node.children));
  };
  sortByName(roots);
  return roots;
}

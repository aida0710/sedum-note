// 画面に並べるメモの絞り込みと並べ替え。画面の部品から切り離して試験できるようにする。

import { bodyPlainText, plainTextHashtags } from "./bodyText";
import type { LiveNote, LiveNotebook } from "./noteRecords";

export type NoteView =
  | { kind: "all" }
  | { kind: "bookmarked" }
  | { kind: "notebook"; notebookId: string }
  | { kind: "tag"; tag: string }
  | { kind: "trash" };

export type NoteSummary = {
  note: LiveNote;
  plainText: string;
  tags: string[];
};

export function summarizeNote(note: LiveNote): NoteSummary {
  const plainText = bodyPlainText(note.body);
  return { note, plainText, tags: plainTextHashtags(plainText) };
}

function belongsToView(summary: NoteSummary, view: NoteView): boolean {
  const { content } = summary.note;
  if (view.kind === "trash") {
    return content.trashedAt !== null;
  }
  if (content.trashedAt !== null) {
    return false;
  }
  switch (view.kind) {
    case "all":
      return true;
    case "bookmarked":
      return content.bookmarked;
    case "notebook":
      return content.notebookIds.includes(view.notebookId);
    case "tag":
      return summary.tags.includes(view.tag);
  }
}

function matchesSearch(summary: NoteSummary, words: string[]): boolean {
  const haystack = `${summary.note.content.title}\n${summary.plainText}`.toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
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
  searchText?: string;
  sortOrder?: NoteSortOrder;
};

// ピン留めを先に、残りは選んだ並び順で返す。
export function selectNotes(summaries: NoteSummary[], { view, searchText = "", sortOrder = "updatedAt" }: NoteSelection): NoteSummary[] {
  const words = searchText.toLocaleLowerCase().split(/\s+/).filter((word) => word !== "");
  return summaries
    .filter((summary) => belongsToView(summary, view) && matchesSearch(summary, words))
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
    if (summary.note.content.trashedAt !== null) {
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

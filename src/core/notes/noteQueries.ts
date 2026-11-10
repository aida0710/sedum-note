// 画面に並べるメモの絞り込みと並べ替え。画面の部品から切り離して試験できるようにする。

import { documentHashtags, documentPlainText } from "./documentText";
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
  const plainText = documentPlainText(note.content.document);
  return { note, plainText, tags: documentHashtags(plainText) };
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

// ピン留めを先に、残りは新しく変えた順。
export function compareNotesForList(left: NoteSummary, right: NoteSummary): number {
  if (left.note.content.pinned !== right.note.content.pinned) {
    return left.note.content.pinned ? -1 : 1;
  }
  return right.note.updatedAt.localeCompare(left.note.updatedAt);
}

export function selectNotes(summaries: NoteSummary[], view: NoteView, searchText = ""): NoteSummary[] {
  const words = searchText.toLocaleLowerCase().split(/\s+/).filter((word) => word !== "");
  return summaries
    .filter((summary) => belongsToView(summary, view) && matchesSearch(summary, words))
    .sort(compareNotesForList);
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
    list.sort((left, right) => left.notebook.content.name.localeCompare(right.notebook.content.name, "ja"));
    list.forEach((node) => sortByName(node.children));
  };
  sortByName(roots);
  return roots;
}

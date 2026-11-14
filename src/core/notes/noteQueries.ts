// 画面に並べるメモの絞り込みと並べ替え。画面の部品から切り離して試験できるようにする。

import { bodyFootnoteTexts, bodyLinkedNoteIds, bodyPlainText, plainTextHashtags } from "./bodyText";
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
  // 検索と抜き出しには、脚注の文も入れる（脚注の文は本文の文字ではなく、印の属性に持つ）。
  const plainText = [bodyPlainText(note.body), ...bodyFootnoteTexts(note.body)].join("\n").trim();
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


// 一覧の並び順。updatedAt と createdAt は新しい順、title は名前の順（A→Z）。…OldestFirst は古い順、titleDescending は名前の逆順（Z→A）。
// 設定の選択欄はこの順に並べる。保存してある値（devicePreferences）と合わせるため、前からある名前は変えない。
export const NOTE_SORT_ORDERS = ["updatedAt", "updatedAtOldestFirst", "createdAt", "createdAtOldestFirst", "title", "titleDescending"] as const;
export type NoteSortOrder = (typeof NOTE_SORT_ORDERS)[number];

function compareBySortOrder(left: LiveNote, right: LiveNote, sortOrder: NoteSortOrder): number {
  switch (sortOrder) {
    case "updatedAt":
      return right.updatedAt.localeCompare(left.updatedAt);
    case "updatedAtOldestFirst":
      return left.updatedAt.localeCompare(right.updatedAt);
    case "createdAt":
      return right.content.createdAt.localeCompare(left.content.createdAt);
    case "createdAtOldestFirst":
      return left.content.createdAt.localeCompare(right.content.createdAt);
    case "title":
      return compareTitles(left, right) || right.updatedAt.localeCompare(left.updatedAt);
    case "titleDescending":
      return compareTitles(right, left) || right.updatedAt.localeCompare(left.updatedAt);
  }
}

// 数字は大きさで比べる（「メモ2」を「メモ10」の前に置く）。同じ名前のメモは、呼び出し側で新しく変えた順にする。
function compareTitles(left: LiveNote, right: LiveNote): number {
  return left.content.title.localeCompare(right.content.title, undefined, { numeric: true });
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

// ノートブックの親をたどる（自分は含めない）。消えた親か、一度たどったノートブックに戻ったら（親子が輪になっている）止める。
function ancestorIdsOf(notebookId: string, notebooksById: ReadonlyMap<string, LiveNotebook>): string[] {
  const ancestors: string[] = [];
  const visited = new Set([notebookId]);
  for (let parentId = notebooksById.get(notebookId)?.content.parentId ?? null; parentId !== null && notebooksById.has(parentId) && !visited.has(parentId);
    parentId = notebooksById.get(parentId)!.content.parentId) {
    ancestors.push(parentId);
    visited.add(parentId);
  }
  return ancestors;
}

// 親子が輪になっているか（親をたどると自分に戻る）。ノートブックを移す操作は、ほかのデバイスの移動と重なると輪を作りうる
// （こちらで A を B の中へ、あちらで B を A の中へ移し、同期で両方が入る）。
function isInParentCycle(notebook: LiveNotebook, notebooksById: ReadonlyMap<string, LiveNotebook>): boolean {
  const ancestors = ancestorIdsOf(notebook.id, notebooksById);
  const topmost = ancestors[ancestors.length - 1];
  const parentOfTopmost = topmost === undefined ? notebook.content.parentId : notebooksById.get(topmost)!.content.parentId;
  return parentOfTopmost === notebook.id;
}

// notebookId が containerId そのものか、その中（何段下でも）にあるか。ノートブックを、自分の中へは移せない。
export function isNotebookWithin(notebooks: LiveNotebook[], notebookId: string, containerId: string): boolean {
  return notebookId === containerId || ancestorIdsOf(notebookId, new Map(notebooks.map((notebook) => [notebook.id, notebook]))).includes(containerId);
}

// 親の無い（または消えた親を指す）ノートブックを最上位にして、名前の順に並べる。親子が輪になったノートブックも
// 最上位に出す（輪の中のどれも最上位に来ず、左の列から消えるのを防ぐ）。
export function buildNotebookTree(notebooks: LiveNotebook[]): NotebookTreeNode[] {
  const notebooksById = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
  const nodes = new Map(notebooks.map((notebook) => [notebook.id, { notebook, children: [] as NotebookTreeNode[] }]));
  const roots: NotebookTreeNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.notebook.content.parentId;
    const parent = parentId !== null && !isInParentCycle(node.notebook, notebooksById) ? nodes.get(parentId) : undefined;
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

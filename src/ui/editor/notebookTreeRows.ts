// ノートブックを選ぶダイアログに並べる行。ノートブックの木を、左の列と同じ順（親の下に子、同じ階層は名前の順）の
// 1 列にし、階層の深さを添える。名前で絞り込むときは、当たったノートブックの親も残す（字下げだけでは、
// どのノートブックの中のものか分からなくなるため）。

import { buildNotebookTree, type NotebookTreeNode } from "../../core/notes/noteQueries";
import type { LiveNotebook } from "../../core/notes/noteRecords";
import { containsAllWords, searchWordsOf } from "../shared/searchWords";

export type NotebookTreeRow = {
  notebook: LiveNotebook;
  // 最上位が 0。
  depth: number;
  // 名前が絞り込みの言葉に当たったか。当たった子の親として残しただけの行は false。絞り込んでいなければ全部 true。
  matchesSearch: boolean;
};

export function notebookTreeRows(notebooks: LiveNotebook[], searchText: string): NotebookTreeRow[] {
  const words = searchWordsOf(searchText);
  const rowsOf = (node: NotebookTreeNode, depth: number): NotebookTreeRow[] => {
    const childRows = node.children.flatMap((child) => rowsOf(child, depth + 1));
    const matchesSearch = containsAllWords(node.notebook.content.name, words);
    return matchesSearch || childRows.length > 0 ? [{ notebook: node.notebook, depth, matchesSearch }, ...childRows] : [];
  };
  return buildNotebookTree(notebooks).flatMap((root) => rowsOf(root, 0));
}

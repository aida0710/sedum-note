// メモとノートブックのロック。ロックしたメモは、開くたびにパスフレーズの確認が要り、確認するまでは題だけを出す。
// アプリのロックを解除したあとは、どのメモも復号されてメモリにある。ここのロックは「画面に出さない」決まりで、
// 暗号ではない（席を外したすきに中身を見られない、ためのもの）。
//
// ノートブックをロックすると、その中のメモと、下の階層のノートブックの中のメモが、すべてロックされる。
// 確認はメモごとに行う（ノートブックの 1 件を確認しても、ほかのメモは開かない）。

import type { NoteSummary } from "./noteQueries";
import type { LiveNote, LiveNotebook } from "./noteRecords";

// ロックされているノートブック（自分か、上の階層のどれかがロックされている）。
function lockedNotebookIds(notebooks: LiveNotebook[]): Set<string> {
  const notebookById = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
  const isLocked = (notebook: LiveNotebook, visitedIds: Set<string>): boolean => {
    if (notebook.content.isLocked) {
      return true;
    }
    const parent = notebook.content.parentId === null ? undefined : notebookById.get(notebook.content.parentId);
    // 同期のマージで親子が輪になっていても、止まるようにする。
    if (!parent || visitedIds.has(parent.id)) {
      return false;
    }
    return isLocked(parent, new Set(visitedIds).add(notebook.id));
  };
  return new Set(notebooks.filter((notebook) => isLocked(notebook, new Set())).map((notebook) => notebook.id));
}

// ロックされているメモ（メモ自身か、入っているノートブックのどれかがロックされている）の ID。
export function lockedNoteIds(notes: LiveNote[], notebooks: LiveNotebook[]): Set<string> {
  const lockedNotebooks = lockedNotebookIds(notebooks);
  return new Set(notes
    .filter((note) => note.content.isLocked || note.content.notebookIds.some((notebookId) => lockedNotebooks.has(notebookId)))
    .map((note) => note.id));
}

// 題のほかの中身（本文から読んだ文字・タグ・リンク、添付、プロパティの値）を抜いた要約。
// 一覧・検索・グラフ・クエリは、これを使えば題だけを出すことになる。
export function concealSummary(summary: NoteSummary): NoteSummary {
  const { note } = summary;
  return { note: { ...note, content: { ...note.content, attachments: [], propertyValues: {} } }, plainText: "", tags: [], linkedNoteIds: [] };
}

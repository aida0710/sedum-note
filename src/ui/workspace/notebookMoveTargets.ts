// ノートブックを移せる先（別のノートブックの中か、最上位の階層）。ドラッグで落とすときと、「移動…」のダイアログで選ぶときに使う。
// 中のメモと子のノートブックも一緒に移る。今と同じ所と、自分の中（自分と、その下のノートブック）へは移さない。

import { buildNotebookTree, isNotebookWithin, type NotebookTreeNode } from "../../core/notes/noteQueries";
import type { LiveNotebook } from "../../core/notes/noteRecords";
import type { PickerChoice } from "../shared/SearchablePicker";

// 「移動…」のダイアログで、最上位の階層を指す選択肢の ID。ノートブックの ID（16 進）と重ならない。
export const TOP_LEVEL_CHOICE_ID = "top-level";

// ノートブックを parentId（null は最上位の階層）の中へ移すと、何か変わるか。
export function canMoveNotebook(notebooks: LiveNotebook[], notebookId: string, parentId: string | null): boolean {
  const notebook = notebooks.find((candidate) => candidate.id === notebookId);
  if (!notebook || notebook.content.parentId === parentId) {
    return false;
  }
  return parentId === null || !isNotebookWithin(notebooks, parentId, notebookId);
}

// 「移動…」のダイアログに並べる移し先。最上位の階層を先に、残りは左の列と同じ順。名前は親からの道筋
//（「旅行 › 沖縄」）にして、同じ名前の子を見分けられ、親の名前でも絞り込めるようにする。
export function notebookMoveChoices(notebooks: LiveNotebook[], notebookId: string, topLevelLabel: string): PickerChoice[] {
  const choices: PickerChoice[] = canMoveNotebook(notebooks, notebookId, null) ? [{ id: TOP_LEVEL_CHOICE_ID, label: topLevelLabel }] : [];
  const visit = (node: NotebookTreeNode, parentNames: string[]) => {
    const names = [...parentNames, node.notebook.content.name];
    if (canMoveNotebook(notebooks, notebookId, node.notebook.id)) {
      choices.push({ id: node.notebook.id, label: names.join(" › ") });
    }
    node.children.forEach((child) => visit(child, names));
  };
  buildNotebookTree(notebooks).forEach((root) => visit(root, []));
  return choices;
}

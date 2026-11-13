// 左の列で、ノートブックをドラッグして、別のノートブックの中か、「ノートブック」の見出し（一番上の段）へ移す操作。
// ノートブックの並びは名前の順なので、同じ段の中での並べ替えはしない。中のメモと子のノートブックも一緒に移る。

import { isNotebookWithin } from "../../core/notes/noteQueries";
import type { LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { showDragPreview } from "../shared/dragPreview";
import { beginSidebarDrag, endSidebarDrag, type SidebarDragState } from "./sidebarDragState";

// ドラッグのデータの種類。メモのドラッグ（shared/noteDragData.ts）やファイルのドラッグと区別する。
const NOTEBOOK_DRAG_TYPE = "application/x-sedum-notebook";

// 一番上の段へ移す落とし先（「ノートブック」の見出し）を光らせるときの印。一覧の viewKey と重ならない。
export const TOP_LEVEL_NOTEBOOK_DROP_KEY = "notebooks-top-level";

export function startNotebookDrag(event: React.DragEvent, notebook: LiveNotebook): void {
  event.dataTransfer.setData(NOTEBOOK_DRAG_TYPE, notebook.id);
  event.dataTransfer.effectAllowed = "move";
  showDragPreview(event, notebook.content.name);
  beginSidebarDrag({ kind: "notebook", notebookId: notebook.id });
}

export function isNotebookDrag(event: React.DragEvent): boolean {
  return event.dataTransfer.types.includes(NOTEBOOK_DRAG_TYPE);
}

// ノートブックを parentId（null は一番上の段）の中へ移すと、何か変わるか。今と同じ所と、自分の中へは移さない。
function canMoveNotebook(notebooks: LiveNotebook[], notebookId: string, parentId: string | null): boolean {
  const notebook = notebooks.find((candidate) => candidate.id === notebookId);
  if (!notebook || notebook.content.parentId === parentId) {
    return false;
  }
  return parentId === null || !isNotebookWithin(notebooks, parentId, notebookId);
}

// いまドラッグしているノートブックを、parentId の中へ落とせるか（落とし先を光らせるか）。
export function canDropDraggedNotebook(parentId: string | null, dragState: SidebarDragState | null, notebooks: LiveNotebook[]): boolean {
  return dragState?.dragged.kind === "notebook" && canMoveNotebook(notebooks, dragState.dragged.notebookId, parentId);
}

// 落としたノートブックを parentId の中へ移す。移したら true。
export async function dropNotebook(event: React.DragEvent, parentId: string | null, repository: NoteRepository): Promise<boolean> {
  const notebookId = event.dataTransfer.getData(NOTEBOOK_DRAG_TYPE);
  endSidebarDrag();
  if (notebookId === "" || !canMoveNotebook(repository.notebooks(), notebookId, parentId)) {
    return false;
  }
  await repository.moveNotebook(notebookId, parentId);
  return true;
}

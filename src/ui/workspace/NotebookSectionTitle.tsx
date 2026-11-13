// 左の列の「ノートブック」の見出しと、ノートブックを足すボタン。ノートブックをドラッグしてこの見出しに落とすと、
// 一番上の段へ移す（notebookDrag.ts）。

import { Plus } from "lucide-react";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { canDropDraggedNotebook, dropNotebook, isNotebookDrag, TOP_LEVEL_NOTEBOOK_DROP_KEY } from "./notebookDrag";
import { markSidebarDropTarget, useSidebarDragState } from "./sidebarDragState";

type NotebookSectionTitleProps = { repository: NoteRepository; onAddNotebook: () => void };

export function NotebookSectionTitle({ repository, onAddNotebook }: NotebookSectionTitleProps) {
  const dragState = useSidebarDragState();
  const acceptsDraggedNotebook = () => dragState?.dragged.kind === "notebook" && canDropDraggedNotebook(null, dragState, repository.notebooks());
  const isDropTarget = dragState?.dropTargetKey === TOP_LEVEL_NOTEBOOK_DROP_KEY && acceptsDraggedNotebook();
  return (
    <div className={`section-title${isDropTarget ? " drop-target" : ""}`}
      onDragOver={(event) => {
        if (!isNotebookDrag(event)) {
          return;
        }
        event.stopPropagation();
        if (acceptsDraggedNotebook()) {
          event.preventDefault();
          markSidebarDropTarget(TOP_LEVEL_NOTEBOOK_DROP_KEY);
        } else {
          markSidebarDropTarget(null);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void dropNotebook(event, null, repository);
      }}>
      {translate("sidebar.notebooks")}
      <button className="icon-button" aria-label={translate("sidebar.newNotebook")} onClick={onAddNotebook}><Plus size={14} /></button>
    </div>
  );
}

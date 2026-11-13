// 左の列のノートブックの 1 行。子のノートブックと中のメモを入れ子で並べ、中へのメモと子の追加・名前の変更・
// 色とアイコン・削除を「…」（と右クリック）から行う。行をドラッグすると、別のノートブックの中へ移せる（notebookDrag.ts）。

import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import type { NotebookTreeNode, NoteSummary } from "../../core/notes/noteQueries";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { type NotebookColors, NotebookMark } from "../shared/notebookAppearance";
import { createNoteInView } from "./createNoteInView";
import { InlineNameInput } from "./InlineNameInput";
import { startNotebookDrag } from "./notebookDrag";
import { NotebookActionsMenu } from "./NotebookActionsMenu";
import { NotebookAppearanceDialog } from "./NotebookAppearanceDialog";
import { ViewGroup } from "./SidebarViewGroup";
import type { WorkspaceNavigation } from "./useWorkspaceNavigation";
import { NotebookPropertiesDialog } from "./NotebookPropertiesDialog";
import { databaseTabId, viewKey } from "./useWorkspaceNavigation";

export type NotebookBranchProps = {
  notebookColors: NotebookColors;
  node: NotebookTreeNode;
  depth: number;
  summaries: NoteSummary[];
  repository: NoteRepository;
  navigation: WorkspaceNavigation;
};

export function NotebookBranch({ node, depth, summaries, repository, navigation, notebookColors }: NotebookBranchProps) {
  const { notebook } = node;
  const view = { kind: "notebook", notebookId: notebook.id } as const;
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [choosingAppearance, setChoosingAppearance] = useState(false);
  const [editingProperties, setEditingProperties] = useState(false);
  if (renaming) {
    return (
      <InlineNameInput initialName={notebook.content.name} placeholder={translate("sidebar.newNotebookPlaceholder")} onDone={(name) => {
        setRenaming(false);
        if (name && name !== notebook.content.name) {
          void repository.updateNotebook(notebook.id, { name });
        }
      }} />
    );
  }
  const children = (
    <>
      {addingChild && (
        <InlineNameInput placeholder={translate("sidebar.newNotebookPlaceholder")} onDone={(name) => {
          setAddingChild(false);
          if (name) {
            void repository.createNotebook(name, notebook.id);
          }
        }} />
      )}
      {node.children.map((child) => (
        <NotebookBranch key={child.notebook.id} node={child} depth={depth + 1} summaries={summaries} repository={repository} navigation={navigation} notebookColors={notebookColors} />
      ))}
    </>
  );
  return (
    <>
      <ViewGroup view={view} depth={depth} expandedByDefault dropsOnWholeGroup
        icon={<NotebookMark notebook={notebook} colors={notebookColors} />}
        label={notebook.content.name} summaries={summaries} navigation={navigation} repository={repository} childBranches={children}
        onContextMenu={setMenuAnchor}
        onDragStart={(event) => startNotebookDrag(event, notebook)}
        actions={
          <button className="icon-button" aria-label={translate("editor.more")} aria-haspopup="menu" onClick={(event) => setMenuAnchor(event.currentTarget)}>
            <MoreHorizontal size={14} />
          </button>
        } />
      {menuAnchor && (
        <NotebookActionsMenu anchor={menuAnchor} notebook={notebook} repository={repository} onClose={() => setMenuAnchor(null)}
          onRename={() => setRenaming(true)}
          onChooseAppearance={() => setChoosingAppearance(true)}
          onEditProperties={() => setEditingProperties(true)}
          onOpenDatabase={() => navigation.openTab(databaseTabId(notebook.id))}
          onAddNote={() => {
            // 作ったメモが左の列に見えるよう、ノートブックを開いておく。
            navigation.setExpanded(viewKey(view), true);
            void createNoteInView(repository, view).then((note) => navigation.openNote(note.id));
          }}
          onAddChild={() => {
            setAddingChild(true);
            navigation.selectView(view);
          }} />
      )}
      {choosingAppearance && <NotebookAppearanceDialog notebook={notebook} repository={repository} onClose={() => setChoosingAppearance(false)} />}
      {editingProperties && <NotebookPropertiesDialog notebook={notebook} repository={repository} onClose={() => setEditingProperties(false)} />}
    </>
  );
}

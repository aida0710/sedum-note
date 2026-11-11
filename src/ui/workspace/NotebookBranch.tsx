// 左の列のノートブックの 1 行。子のノートブックと中のメモを入れ子で並べ、名前の変更・
// 色とアイコン・子の追加・削除を「…」から行う。

import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import type { NotebookTreeNode, NoteSummary } from "../../core/notes/noteQueries";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { type NotebookColors, NotebookMark } from "../shared/notebookAppearance";
import { NotebookActionsMenu } from "./NotebookActionsMenu";
import { NotebookAppearanceDialog } from "./NotebookAppearanceDialog";
import { ViewGroup } from "./SidebarViewGroup";
import type { WorkspaceNavigation } from "./useWorkspaceNavigation";

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
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [choosingAppearance, setChoosingAppearance] = useState(false);
  if (renaming) {
    return (
      <NotebookNameInput initialName={notebook.content.name} onDone={(name) => {
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
        <NotebookNameInput onDone={(name) => {
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
      <ViewGroup view={{ kind: "notebook", notebookId: notebook.id }} depth={depth} expandedByDefault
        icon={<NotebookMark notebook={notebook} colors={notebookColors} />}
        label={notebook.content.name} summaries={summaries} navigation={navigation} childBranches={children}
        actions={
          <button className="icon-button" aria-label={translate("editor.more")} aria-haspopup="menu" onClick={(event) => setMenuAnchor(event.currentTarget)}>
            <MoreHorizontal size={14} />
          </button>
        } />
      {menuAnchor && (
        <NotebookActionsMenu anchor={menuAnchor} notebook={notebook} repository={repository} onClose={() => setMenuAnchor(null)}
          onRename={() => setRenaming(true)}
          onChooseAppearance={() => setChoosingAppearance(true)}
          onAddChild={() => {
            setAddingChild(true);
            navigation.selectView({ kind: "notebook", notebookId: notebook.id });
          }} />
      )}
      {choosingAppearance && <NotebookAppearanceDialog notebook={notebook} repository={repository} onClose={() => setChoosingAppearance(false)} />}
    </>
  );
}

export function NotebookNameInput({ initialName = "", onDone }: { initialName?: string; onDone: (name: string) => void }) {
  const [name, setName] = useState(initialName);
  return (
    <input className="inline-input" autoFocus value={name} placeholder={translate("sidebar.newNotebookPlaceholder")}
      onChange={(event) => setName(event.target.value)}
      onBlur={() => onDone(name.trim())}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          onDone(name.trim());
        } else if (event.key === "Escape") {
          onDone("");
        }
      }} />
  );
}

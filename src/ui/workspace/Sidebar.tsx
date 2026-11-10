// 案C の左の列: 一覧（すべて・お気に入り・ノートブック・タグ・ゴミ箱）を木にして、
// 開いた所にメモを並べる。

import { ChevronDown, ChevronRight, FileText, Hash, MoreHorizontal, Plus, Search, Star, Trash2, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { buildNotebookTree, countTags, type NotebookTreeNode, type NoteSummary, type NoteView, selectNotes } from "../../core/notes/noteQueries";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import type { RepositorySnapshot } from "../session/useRepositorySnapshot";
import { notebookColor } from "../shared/notebookColor";
import { NotebookActionsMenu } from "./NotebookActionsMenu";
import type { WorkspaceNavigation } from "./useWorkspaceNavigation";
import { viewKey } from "./useWorkspaceNavigation";

type SidebarProps = {
  snapshot: RepositorySnapshot;
  repository: NoteRepository;
  navigation: WorkspaceNavigation;
  onCreateNote: () => void;
  footer: ReactNode;
};

export function Sidebar({ snapshot, repository, navigation, onCreateNote, footer }: SidebarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [addingNotebook, setAddingNotebook] = useState(false);
  const { summaries } = snapshot;
  const notebookTree = buildNotebookTree(snapshot.notebooks);
  const tags = countTags(summaries);
  const searching = navigation.searchText.trim() !== "";

  const closeSearch = () => {
    setSearchOpen(false);
    navigation.setSearchText("");
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <FileText size={16} />{translate("app.name")}
        <button className="icon-button" aria-label={translate("sidebar.search")} onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}>
          {searchOpen ? <X size={16} /> : <Search size={16} />}
        </button>
      </div>
      {searchOpen && (
        <label className="sidebar-search">
          <Search size={14} />
          <input autoFocus value={navigation.searchText} placeholder={translate("sidebar.searchPlaceholder")}
            onChange={(event) => navigation.setSearchText(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && closeSearch()} />
        </label>
      )}
      <button className="new-note" onClick={onCreateNote}><Plus size={16} />{translate("sidebar.newNote")}</button>
      <div className="sidebar-scroll">
        {searching ? (
          <SearchResults summaries={selectNotes(summaries, { kind: "all" }, navigation.searchText)} navigation={navigation} />
        ) : (
          <>
            <ViewGroup view={{ kind: "all" }} icon={<FileText size={15} />} label={translate("sidebar.allNotes")} summaries={summaries} navigation={navigation} />
            <ViewGroup view={{ kind: "bookmarked" }} icon={<Star size={15} />} label={translate("sidebar.bookmarked")} summaries={summaries} navigation={navigation} />
            <div className="section-title">
              {translate("sidebar.notebooks")}
              <button className="icon-button" aria-label={translate("sidebar.newNotebook")} onClick={() => setAddingNotebook(true)}><Plus size={14} /></button>
            </div>
            {addingNotebook && (
              <NotebookNameInput onDone={(name) => {
                setAddingNotebook(false);
                if (name) {
                  void repository.createNotebook(name);
                }
              }} />
            )}
            {notebookTree.map((node) => (
              <NotebookBranch key={node.notebook.id} node={node} depth={0} summaries={summaries} repository={repository} navigation={navigation} />
            ))}
            {tags.length > 0 && <div className="section-title">{translate("sidebar.tags")}</div>}
            {tags.map(({ tag }) => (
              <ViewGroup key={tag} view={{ kind: "tag", tag }} icon={<Hash size={15} />} label={tag} summaries={summaries} navigation={navigation} />
            ))}
            <ViewGroup view={{ kind: "trash" }} icon={<Trash2 size={15} />} label={translate("sidebar.trash")} summaries={summaries} navigation={navigation} />
          </>
        )}
      </div>
      {footer}
    </aside>
  );
}

type ViewGroupProps = {
  view: NoteView;
  icon: ReactNode;
  label: string;
  summaries: NoteSummary[];
  navigation: WorkspaceNavigation;
  depth?: number;
  actions?: ReactNode;
  childBranches?: ReactNode;
};

// 開くと中のメモが並ぶ 1 行。ノートブック・タグ・ゴミ箱で同じ形を使う。
function ViewGroup({ view, icon, label, summaries, navigation, depth = 0, actions, childBranches }: ViewGroupProps) {
  const key = viewKey(view);
  const expanded = navigation.expandedIds.has(key);
  const notes = selectNotes(summaries, view);
  const isActive = viewKey(navigation.view) === key;
  const indent = { paddingLeft: 8 + depth * 14 };
  return (
    <>
      <div className="nav-row">
        <button className={`nav${isActive ? " active" : ""}`} style={indent} aria-expanded={expanded}
          onClick={() => {
            if (isActive) {
              navigation.toggleExpanded(key);
            } else {
              navigation.selectView(view);
            }
          }}>
          <span className="disclosure">{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
          {icon}
          <span className="nav-label">{label}</span>
          <span className="count">{notes.length}</span>
        </button>
        {actions && <span className="row-actions">{actions}</span>}
      </div>
      {expanded && (
        <>
          {childBranches}
          <NoteRows notes={notes} navigation={navigation} depth={depth + 1} />
        </>
      )}
    </>
  );
}

function NoteRows({ notes, navigation, depth }: { notes: NoteSummary[]; navigation: WorkspaceNavigation; depth: number }) {
  if (notes.length === 0) {
    return <div className="tree-empty" style={{ paddingLeft: 30 + depth * 14 }}>{translate("sidebar.noNotes")}</div>;
  }
  return notes.map(({ note }) => (
    <button key={note.id} className={`tree-note${navigation.activeTab === note.id ? " active" : ""}`} style={{ paddingLeft: 30 + depth * 14 }}
      onClick={() => navigation.openNote(note.id)}>
      {note.content.title || translate("sidebar.untitled")}
    </button>
  ));
}

function SearchResults({ summaries, navigation }: { summaries: NoteSummary[]; navigation: WorkspaceNavigation }) {
  return (
    <>
      <div className="section-title">{translate("sidebar.searchResults", { count: summaries.length })}</div>
      <NoteRows notes={summaries} navigation={navigation} depth={-1} />
    </>
  );
}

type NotebookBranchProps = {
  node: NotebookTreeNode;
  depth: number;
  summaries: NoteSummary[];
  repository: NoteRepository;
  navigation: WorkspaceNavigation;
};

function NotebookBranch({ node, depth, summaries, repository, navigation }: NotebookBranchProps) {
  const { notebook } = node;
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
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
        <NotebookBranch key={child.notebook.id} node={child} depth={depth + 1} summaries={summaries} repository={repository} navigation={navigation} />
      ))}
    </>
  );
  return (
    <>
      <ViewGroup view={{ kind: "notebook", notebookId: notebook.id }} depth={depth}
        icon={<span className="dot" style={{ background: notebookColor(notebook.id) }} />}
        label={notebook.content.name} summaries={summaries} navigation={navigation} childBranches={children}
        actions={
          <button className="icon-button" aria-label={translate("editor.more")} aria-haspopup="menu" onClick={(event) => setMenuAnchor(event.currentTarget)}>
            <MoreHorizontal size={14} />
          </button>
        } />
      {menuAnchor && (
        <NotebookActionsMenu anchor={menuAnchor} notebook={notebook} repository={repository} onClose={() => setMenuAnchor(null)}
          onRename={() => setRenaming(true)}
          onAddChild={() => {
            setAddingChild(true);
            navigation.selectView({ kind: "notebook", notebookId: notebook.id });
          }} />
      )}
    </>
  );
}

function NotebookNameInput({ initialName = "", onDone }: { initialName?: string; onDone: (name: string) => void }) {
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

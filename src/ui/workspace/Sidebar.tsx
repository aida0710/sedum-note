// 案C の左の列: 一覧（すべて・お気に入り・ノートブック・タグ・ゴミ箱）を木にして、
// 開いた所にメモを並べる。

import { FileText, Hash, Plus, Search, Star, Trash2, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { buildNotebookTree, countTags, selectNotes } from "../../core/notes/noteQueries";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { useDevicePreferences } from "../preferences/devicePreferences";
import type { RepositorySnapshot } from "../session/useRepositorySnapshot";
import { assignNotebookColors } from "../shared/notebookAppearance";
import { NotebookBranch, NotebookNameInput } from "./NotebookBranch";
import { SearchResults, ViewGroup } from "./SidebarViewGroup";
import type { WorkspaceNavigation } from "./useWorkspaceNavigation";

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
  const notebookColors = assignNotebookColors(snapshot.notebooks);
  const { noteSortOrder } = useDevicePreferences();
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
          <SearchResults summaries={selectNotes(summaries, { view: { kind: "all" }, searchText: navigation.searchText, sortOrder: noteSortOrder })} navigation={navigation} />
        ) : (
          <>
            {/* ノートブックが無いうちは、メモを並べる所がほかに無いので開いておく。 */}
            <ViewGroup view={{ kind: "all" }} icon={<FileText size={15} />} label={translate("sidebar.allNotes")} summaries={summaries} navigation={navigation}
              expandedByDefault={notebookTree.length === 0} />
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
              <NotebookBranch key={node.notebook.id} node={node} depth={0} summaries={summaries} repository={repository} navigation={navigation} notebookColors={notebookColors} />
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

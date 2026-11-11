// 案C の左の列: 一覧（すべて・お気に入り・ノートブック・タグ・ゴミ箱）を木にして、
// 開いた所にメモを並べる。

import { FileText, Hash, LayoutTemplate, Plus, Search, Star, Trash2, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { buildNotebookTree, countTags, type NoteView, selectNotes } from "../../core/notes/noteQueries";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { useDevicePreferences } from "../preferences/devicePreferences";
import type { RepositorySnapshot } from "../session/useRepositorySnapshot";
import { assignNotebookColors } from "../shared/notebookAppearance";
import { InlineNameInput } from "./InlineNameInput";
import { NotebookBranch } from "./NotebookBranch";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
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

  // 検索の欄を開く合図（ショートカット）が来たら開く。開いていれば、欄にカーソルを置き直す。
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (navigation.searchFocusRequest > 0) {
      setSearchOpen(true);
      searchInput.current?.focus();
    }
  }, [navigation.searchFocusRequest]);
  // ノートブックかタグを開いているときは、まずその中を探す。「すべてのメモ」に広げられる。
  const [searchEverywhere, setSearchEverywhere] = useState(false);
  const scopedView = navigation.view.kind === "notebook" || navigation.view.kind === "tag" ? navigation.view : null;
  const searchView: NoteView = scopedView && !searchEverywhere ? scopedView : { kind: "all" };
  const scopeName = scopedView?.kind === "notebook"
    ? snapshot.notebooks.find((notebook) => notebook.id === scopedView.notebookId)?.content.name ?? ""
    : scopedView?.kind === "tag" ? `#${scopedView.tag}` : "";

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
          <input ref={searchInput} autoFocus value={navigation.searchText} placeholder={translate("sidebar.searchPlaceholder")}
            onChange={(event) => navigation.setSearchText(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && closeSearch()} />
        </label>
      )}
      <button className="new-note" onClick={onCreateNote}><Plus size={16} />{translate("sidebar.newNote")}</button>
      <div className="sidebar-scroll">
        {searching ? (
          <>
            {scopedView && (
              <button className="search-scope" onClick={() => setSearchEverywhere(!searchEverywhere)}>
                {searchEverywhere ? translate("sidebar.searchOnlyIn", { name: scopeName }) : translate("sidebar.searchingIn", { name: scopeName })}
              </button>
            )}
            <SearchResults summaries={selectNotes(summaries, { view: searchView, searchText: navigation.searchText, sortOrder: noteSortOrder })}
              view={searchView} navigation={navigation} repository={repository} />
          </>
        ) : (
          <>
            {/* ノートブックが無いうちは、メモを並べる所がほかに無いので開いておく。 */}
            <ViewGroup view={{ kind: "all" }} icon={<FileText size={15} />} label={translate("sidebar.allNotes")} summaries={summaries} navigation={navigation} repository={repository}
              expandedByDefault={notebookTree.length === 0} />
            <ViewGroup view={{ kind: "bookmarked" }} icon={<Star size={15} />} label={translate("sidebar.bookmarked")} summaries={summaries} navigation={navigation} repository={repository} />
            <div className="section-title">
              {translate("sidebar.notebooks")}
              <button className="icon-button" aria-label={translate("sidebar.newNotebook")} onClick={() => setAddingNotebook(true)}><Plus size={14} /></button>
            </div>
            {addingNotebook && (
              <InlineNameInput placeholder={translate("sidebar.newNotebookPlaceholder")} onDone={(name) => {
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
              <ViewGroup key={tag} view={{ kind: "tag", tag }} icon={<Hash size={15} />} label={tag} summaries={summaries} navigation={navigation} repository={repository} />
            ))}
            {summaries.some((summary) => summary.note.content.isTemplate && summary.note.content.trashedAt === null) && (
              <ViewGroup view={{ kind: "templates" }} icon={<LayoutTemplate size={15} />} label={translate("sidebar.templates")} summaries={summaries} navigation={navigation} repository={repository} />
            )}
            <ViewGroup view={{ kind: "trash" }} icon={<Trash2 size={15} />} label={translate("sidebar.trash")} summaries={summaries} navigation={navigation} repository={repository} />
          </>
        )}
      </div>
      {footer}
      <SidebarResizeHandle />
    </aside>
  );
}

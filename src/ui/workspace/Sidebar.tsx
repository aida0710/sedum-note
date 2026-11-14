// 案C の左の列: 一覧（すべて・お気に入り・ノートブック・タグ・ゴミ箱）を木にして、
// 開いた所にメモを並べる。

import { AlarmClock, Bookmark, FileText, Hash, LayoutTemplate, Maximize2, MoreHorizontal, Plus, Search, Star, Trash2, Waypoints, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { buildNotebookTree, countTags, notebookNameLookup, type NoteView, selectNotes } from "../../core/notes/noteQueries";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { translate } from "../i18n/translate";
import { useDevicePreferences } from "../preferences/devicePreferences";
import type { RepositorySnapshot } from "../session/useRepositorySnapshot";
import { assignNotebookColors } from "../shared/notebookAppearance";
import { NewNotebookNameRow } from "./SidebarNameRow";
import { NotebookBranch } from "./NotebookBranch";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { SearchResults, ViewGroup } from "./SidebarViewGroup";
import { useNotesByView } from "./useNotesByView";
import { isNotebookDrag } from "./notebookDrag";
import { NotebookSectionTitle } from "./NotebookSectionTitle";
import { isNoteDrag } from "./noteDrag";
import { markSidebarDropTarget } from "./sidebarDragState";
import { moveFocusBetweenRows } from "./sidebarKeyboard";
import type { WorkspaceNavigation } from "./useWorkspaceNavigation";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { SpaceSwitcher } from "./SpaceSwitcher";
import { REMINDERS_TAB } from "./useWorkspaceNavigation";
import { dueItemsOf } from "../../core/notes/dueItems";
import { useDialogs } from "../shared/DialogProvider";
import { useToast } from "../shared/ToastProvider";
import { SearchScopeSwitch } from "../shared/SearchScopeSwitch";
import { TrashActionsMenu } from "./TrashActionsMenu";
import { AppIcon } from "../shared/AppIcon";
import { SidebarCount } from "./SidebarCount";
import type { LiveSavedSearch } from "../../core/notes/noteRecords";

type SidebarProps = {
  snapshot: RepositorySnapshot;
  repository: NoteRepository;
  navigation: WorkspaceNavigation;
  onCreateNote: () => void;
  onEnterFocusMode: () => void;
  onOpenGraph: () => void;
  onOpenReminders: () => void;
  footer: ReactNode;
};

export function Sidebar({ snapshot, repository, navigation, onCreateNote, onEnterFocusMode, onOpenGraph, onOpenReminders, footer }: SidebarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [addingNotebook, setAddingNotebook] = useState(false);
  const { summaries } = snapshot;
  const notebookTree = buildNotebookTree(snapshot.notebooks);
  const tags = countTags(summaries);
  const notebookColors = assignNotebookColors(snapshot.notebooks);
  const { noteSortOrder } = useDevicePreferences();
  const notesInView = useNotesByView(summaries, noteSortOrder);
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

  const dialogs = useDialogs();
  const showToast = useToast();
  const [trashMenuAnchor, setTrashMenuAnchor] = useState<HTMLElement | null>(null);
  const trashedNoteIds = summaries.filter((summary) => summary.note.content.trashedAt !== null).map((summary) => summary.note.id);
  // 今の検索（言葉と範囲）に名前を付けて保存する。
  const saveSearch = async () => {
    const searchText = navigation.searchText.trim();
    const name = await dialogs.prompt({ title: translate("sidebar.saveSearch"), message: translate("sidebar.saveSearchPrompt"), confirmLabel: translate("common.save"), initialValue: searchText });
    if (name?.trim()) {
      await repository.createSavedSearch({
        name: name.trim(), searchText,
        notebookId: searchView.kind === "notebook" ? searchView.notebookId : null,
        tag: searchView.kind === "tag" ? searchView.tag : null,
      });
    }
  };
  const openSavedSearch = ({ content }: LiveSavedSearch) => {
    const scope: NoteView | null = content.notebookId !== null ? { kind: "notebook", notebookId: content.notebookId } : content.tag !== null ? { kind: "tag", tag: content.tag } : null;
    if (scope) {
      navigation.selectView(scope);
    }
    setSearchEverywhere(scope === null);
    setSearchOpen(true);
    navigation.setSearchText(content.searchText);
  };

  // 保存した検索は同期される記録なので、消したらすぐ戻せるようにする。戻すときは、同じ中身で作り直す。
  const removeSavedSearch = async ({ id, content }: LiveSavedSearch) => {
    await repository.removeSavedSearch(id);
    showToast({
      message: translate("toast.savedSearchRemoved", { name: content.name }),
      action: {
        label: translate("toast.undo"),
        run: () => void repository.createSavedSearch({ name: content.name, searchText: content.searchText, notebookId: content.notebookId, tag: content.tag }),
      },
    });
  };

  const closeSearch = () => {
    setSearchOpen(false);
    navigation.setSearchText("");
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <AppIcon className="sidebar-brand-icon" size={18} /><span className="sidebar-brand-name">{translate("app.name")}</span>
        <span className="sidebar-brand-actions">
          <button className="icon-button" aria-label={translate("graph.title")} title={translate("graph.title")} onClick={onOpenGraph}>
            <Waypoints size={16} />
          </button>
          <button className="icon-button" aria-label={translate("shortcut.focusMode")} title={translate("shortcut.focusMode")} onClick={onEnterFocusMode}>
            <Maximize2 size={16} />
          </button>
        <button className="icon-button" aria-label={translate("sidebar.search")} onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}>
          {searchOpen ? <X size={16} /> : <Search size={16} />}
        </button>
        </span>
      </div>
      <SpaceSwitcher />
      {searchOpen && (
        <label className="sidebar-search">
          <Search size={14} />
          <input ref={searchInput} type="search" enterKeyHint="search" autoCapitalize="off" autoCorrect="off" spellCheck={false} autoFocus value={navigation.searchText} placeholder={translate("sidebar.searchPlaceholder")} title={translate("sidebar.searchSyntax")}
            onChange={(event) => navigation.setSearchText(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && !isImeKeyEvent(event.nativeEvent) && closeSearch()} />
        </label>
      )}
      <button className="new-note" onClick={onCreateNote}><Plus size={16} />{translate("sidebar.newNote")}</button>
      {/* 落とせる一覧の外（タグ、見出し、行の間）に来たら、落とし先の光りを消す。一覧の外へ出たときも消す。 */}
      <div className="sidebar-scroll" onKeyDown={moveFocusBetweenRows}
        onDragOver={(event) => (isNoteDrag(event) || isNotebookDrag(event)) && markSidebarDropTarget(null)}
        onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && markSidebarDropTarget(null)}>
        {searching ? (
          <>
            {scopedView && (
              <SearchScopeSwitch scopeName={scopeName} searchesEverywhere={searchEverywhere} onChange={setSearchEverywhere} />
            )}
            <button className="search-scope" onClick={() => void saveSearch()}><Bookmark size={13} />{translate("sidebar.saveSearch")}</button>
            <SearchResults summaries={selectNotes(summaries, { view: searchView, searchText: navigation.searchText, sortOrder: noteSortOrder, notebookNameOf: notebookNameLookup(snapshot.notebooks) })}
              view={searchView} navigation={navigation} repository={repository} />
          </>
        ) : (
          <>
            {/* ノートブックが無いうちは、メモを並べる所がほかに無いので開いておく。 */}
            <ViewGroup view={{ kind: "all" }} icon={<FileText size={15} />} label={translate("sidebar.allNotes")} notesInView={notesInView} navigation={navigation} repository={repository}
              expandedByDefault={notebookTree.length === 0} />
            <ViewGroup view={{ kind: "bookmarked" }} icon={<Star size={15} />} label={translate("sidebar.bookmarked")} notesInView={notesInView} navigation={navigation} repository={repository} />
            {/* 期限の一覧は、メモの並びではないので開け閉めは無い。押すとタブで開く。数は、済んでいない期限。 */}
            <div className="nav-row">
              <button className={`nav${navigation.activeTab === REMINDERS_TAB ? " active" : ""}`} onClick={onOpenReminders}>
                <span className="disclosure" />
                <AlarmClock size={15} />
                <span className="nav-label">{translate("due.title")}</span>
                <SidebarCount count={dueItemsOf(summaries).filter((item) => !item.done).length} />
              </button>
            </div>
            {/* テンプレートとゴミ箱も、メモの並びの 1 つとして、上のまとまりに置く（タグの見出しの下に置くと、タグの 1 つに見える）。 */}
            {summaries.some((summary) => summary.note.content.isTemplate && summary.note.content.trashedAt === null) && (
              <ViewGroup view={{ kind: "templates" }} icon={<LayoutTemplate size={15} />} label={translate("sidebar.templates")} notesInView={notesInView} navigation={navigation} repository={repository} />
            )}
            <ViewGroup view={{ kind: "trash" }} icon={<Trash2 size={15} />} label={translate("sidebar.trash")} notesInView={notesInView} navigation={navigation} repository={repository}
              onContextMenu={setTrashMenuAnchor}
              actions={
                <button className="icon-button" aria-label={translate("sidebar.trashActions")} aria-haspopup="menu" onClick={(event) => setTrashMenuAnchor(event.currentTarget)}>
                  <MoreHorizontal size={14} />
                </button>
              } />
            {trashMenuAnchor && <TrashActionsMenu anchor={trashMenuAnchor} trashedNoteIds={trashedNoteIds} repository={repository} onClose={() => setTrashMenuAnchor(null)} />}
            <NotebookSectionTitle repository={repository} onAddNotebook={() => setAddingNotebook(true)} />
            {addingNotebook && (
              <NewNotebookNameRow depth={0} placeholder={translate("sidebar.newNotebookPlaceholder")} onDone={(name) => {
                setAddingNotebook(false);
                if (name) {
                  void repository.createNotebook(name);
                }
              }} />
            )}
            {notebookTree.map((node) => (
              <NotebookBranch key={node.notebook.id} node={node} depth={0} notesInView={notesInView} repository={repository} navigation={navigation} notebookColors={notebookColors} />
            ))}
            {snapshot.savedSearches.length > 0 && <div className="section-title">{translate("sidebar.savedSearches")}</div>}
            {snapshot.savedSearches.map((savedSearch) => (
              <div key={savedSearch.id} className="nav-row saved-search-row">
                <button className="nav" title={savedSearch.content.name} onClick={() => openSavedSearch(savedSearch)}>
                  <Bookmark size={15} /><span className="nav-label">{savedSearch.content.name}</span>
                </button>
                <span className="row-actions">
                  <button className="icon-button" aria-label={translate("sidebar.removeSavedSearch", { name: savedSearch.content.name })}
                    onClick={() => void removeSavedSearch(savedSearch)}><X size={14} /></button>
                </span>
              </div>
            ))}
            {tags.length > 0 && <div className="section-title">{translate("sidebar.tags")}</div>}
            {tags.map(({ tag }) => (
              <ViewGroup key={tag} view={{ kind: "tag", tag }} icon={<Hash size={15} />} label={tag} notesInView={notesInView} navigation={navigation} repository={repository} />
            ))}
          </>
        )}
      </div>
      {footer}
      <SidebarResizeHandle />
    </aside>
  );
}

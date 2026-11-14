// スマホのメモの一覧（検索・ノートブックの切り替え・要約とサムネイル）。「ノートブック」タブから開いた一覧には、戻るボタンを出す。
// メモを左へ払うとゴミ箱に入れ、右へ払うとピン留めを付け外しする。同期先があれば、上から引いて離すと同期する。

import { ChevronLeft, Pin, PinOff, RefreshCw, Search, Trash2, X } from "lucide-react";
import { type ReactNode, useContext } from "react";
import type { NoteSummary, NoteView } from "../../core/notes/noteQueries";
import type { LiveNotebook } from "../../core/notes/noteRecords";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { useAttachmentUrl } from "../editor/attachmentReader";
import { notebookTreeRows } from "../editor/notebookTreeRows";
import { translate } from "../i18n/translate";
import { UnsyncedRecordsContext } from "../session/useRepositorySnapshot";
import { formatShortDate } from "../shared/formatTime";
import { SearchScopeSwitch } from "../shared/SearchScopeSwitch";
import { assignNotebookColors, NotebookMark, type NotebookColors } from "../shared/notebookAppearance";
import { useTrashWithUndo } from "../workspace/useTrashWithUndo";
import type { WorkspaceProps } from "../workspace/workspaceProps";
import { LIST_ROW_NOTE_ID_ATTRIBUTE, useRememberedListScroll } from "./rememberedListScroll";
import { type PullState, usePullToSync } from "./usePullToSync";
import { useSwipeActions } from "./useSwipeActions";

export function listTitle(view: NoteView, notebooks: WorkspaceProps["snapshot"]["notebooks"]): string {
  if (view.kind === "notebook") {
    return notebooks.find((notebook) => notebook.id === view.notebookId)?.content.name ?? translate("sidebar.allNotes");
  }
  if (view.kind === "tag") {
    return `#${view.tag}`;
  }
  const titles = { bookmarked: "sidebar.bookmarked", trash: "sidebar.trash", templates: "sidebar.templates", all: "sidebar.allNotes" } as const;
  return translate(titles[view.kind]);
}

type NoteListProps = {
  title: string;
  summaries: NoteSummary[];
  notebooks: LiveNotebook[];
  view: NoteView;
  // スクロール位置を覚える単位。下のタブと開いている一覧ごとに別の文字にする。
  listKey: string;
  showChips: boolean;
  // 題の右に出すもの（同期の状態）。
  headerEnd: ReactNode;
  // ノートブックかタグの一覧の中を検索している間の、検索する範囲。それ以外は null（切り替えを出さない）。
  searchScope: { searchesEverywhere: boolean; onChange: (searchesEverywhere: boolean) => void } | null;
  // 「ノートブック」タブから開いた一覧で、ノートブックの一覧へ戻る。ほかの一覧では渡さない。
  onBackToLibrary?: () => void;
  navigation: WorkspaceProps["navigation"];
  repository: NoteRepository;
  onOpen: (noteId: string) => void;
  // 引いて離したときに同期する。同期先が無ければ null（引けない）。
  onPullToSync: (() => Promise<void>) | null;
};

const PULL_MESSAGES = { idle: "mobile.pullToSync", pulling: "mobile.pullToSync", ready: "mobile.releaseToSync", syncing: "mobile.syncing" } as const satisfies Record<PullState, string>;

export function NoteList({ title, summaries, notebooks, view, listKey, showChips, headerEnd, searchScope, onBackToLibrary, navigation, repository, onOpen, onPullToSync }: NoteListProps) {
  const { listRef, scrollRef, indicatorRef, pullState } = usePullToSync(onPullToSync);
  useRememberedListScroll(scrollRef, listKey);
  const notebookColors = assignNotebookColors(notebooks);
  const { searchText } = navigation;
  return (
    <>
      {onBackToLibrary && (
        <div className="phone-top">
          <button className="phone-back" onClick={onBackToLibrary}><ChevronLeft size={20} />{translate("mobile.notebooks")}</button>
        </div>
      )}
      <div className={`phone-top${onBackToLibrary ? " phone-top-below-back" : ""}`}>
        <h2>{title}</h2>
        <div className="phone-top-end">{headerEnd}</div>
      </div>
      <label className="phone-search">
        <Search size={15} />
        <input type="search" enterKeyHint="search" autoCapitalize="off" autoCorrect="off" spellCheck={false}
          value={searchText} placeholder={translate("sidebar.searchPlaceholder")} onChange={(event) => navigation.setSearchText(event.target.value)} />
        {searchText !== "" && (
          <button type="button" className="icon-button" aria-label={translate("mobile.clearSearch")} onClick={() => navigation.setSearchText("")}><X size={15} /></button>
        )}
      </label>
      {searchScope && <SearchScopeSwitch scopeName={title} searchesEverywhere={searchScope.searchesEverywhere} onChange={searchScope.onChange} />}
      {showChips && (
        <div className="chips">
          <button className={`chip${view.kind === "all" ? " on" : ""}`} onClick={() => navigation.selectView({ kind: "all" })}>{translate("mobile.all")}</button>
          {notebookTreeRows(notebooks, "").map(({ notebook }) => (
            <button key={notebook.id} className={`chip${view.kind === "notebook" && view.notebookId === notebook.id ? " on" : ""}`}
              onClick={() => navigation.selectView({ kind: "notebook", notebookId: notebook.id })}><NotebookMark notebook={notebook} colors={notebookColors} /><span className="chip-label">{notebook.content.name}</span></button>
          ))}
        </div>
      )}
      <div ref={listRef} className="phone-list">
        {onPullToSync && (
          <div ref={indicatorRef} className="pull-to-sync" data-state={pullState} role="status">
            <RefreshCw size={16} />{pullState === "idle" ? "" : translate(PULL_MESSAGES[pullState])}
          </div>
        )}
        <div ref={scrollRef} className="phone-scroll">
          {summaries.length === 0 && (
            <div className="empty-state">
              {searchText.trim() === "" ? translate("sidebar.noNotes") : translate("mobile.noSearchResults", { query: searchText.trim() })}
            </div>
          )}
          {summaries.map((summary) => <NoteListItem key={summary.note.id} summary={summary} notebooks={notebooks} notebookColors={notebookColors} repository={repository} onOpen={onOpen} />)}
        </div>
      </div>
    </>
  );
}

type NoteListItemProps = { summary: NoteSummary; notebooks: LiveNotebook[]; notebookColors: NotebookColors; repository: NoteRepository; onOpen: (noteId: string) => void };

function NoteListItem({ summary, notebooks, notebookColors, repository, onOpen }: NoteListItemProps) {
  const { note, plainText } = summary;
  const { pinned, isTemplate, trashedAt } = note.content;
  const unsyncedIds = useContext(UnsyncedRecordsContext);
  const moveToTrash = useTrashWithUndo(repository);
  // ゴミ箱の中のメモは払えない。テンプレートはピン留めしない（テンプレートの一覧はピン留めで並べない）。
  const swipe = useSwipeActions(trashedAt !== null ? {} : {
    onSwipeLeft: () => void moveToTrash([note.id]),
    onSwipeRight: isTemplate ? undefined : () => void repository.updateNote(note.id, { pinned: !pinned }),
  });
  const firstImage = note.content.attachments.find((attachment) => attachment.mimeType.startsWith("image/")) ?? null;
  const thumbnail = useAttachmentUrl(firstImage?.id ?? null, firstImage?.mimeType);
  const noteNotebooks = notebooks.filter((notebook) => note.content.notebookIds.includes(notebook.id));
  return (
    <div ref={swipe.rowRef} className="note-item-row" {...{ [LIST_ROW_NOTE_ID_ATTRIBUTE]: note.id }}>
      <span className="swipe-action swipe-action-right" aria-hidden="true">
        {pinned ? <PinOff size={16} /> : <Pin size={16} />}{translate(pinned ? "editor.unpin" : "editor.pin")}
      </span>
      <span className="swipe-action swipe-action-left" aria-hidden="true"><Trash2 size={16} />{translate("editor.moveToTrash")}</span>
      <button ref={swipe.itemRef} className="note-item" {...swipe.handlers} onClick={() => onOpen(note.id)}>
        <h3>{unsyncedIds.has(note.id) && <span className="unsynced-dot" title={translate("editor.unsynced")} />}{pinned && <Pin size={13} className="pin" />}<span className="note-item-title">{note.content.title || translate("sidebar.untitled")}</span></h3>
        {firstImage && thumbnail.state === "ready" && <img className="thumb" src={thumbnail.url} alt="" />}
        <p>{plainText}</p>
        {/* ノートブックは、PC の左の列と同じ色の印を付けて出す（どのノートブックのメモかを、色でも見分けられる）。 */}
        <span className="meta">
          {formatShortDate(note.updatedAt)}
          {noteNotebooks.map((notebook) => (
            <span key={notebook.id} className="meta-notebook"><NotebookMark notebook={notebook} colors={notebookColors} />{notebook.content.name}</span>
          ))}
        </span>
      </button>
    </div>
  );
}

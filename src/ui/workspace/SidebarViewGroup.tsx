// 左の列の 1 行（すべて・お気に入り・ノートブック・タグ・ゴミ箱）と、開いたときに並ぶメモ。
// メモをドラッグして行に落とすと、その一覧へ移す。ノートブックは、行と中のメモの範囲全体に落とせ、ノートブックを
// 落とすと、その中へ移す（notebookDrag.ts）。

import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, type Ref, useContext, useEffect, useMemo } from "react";
import type { NoteSummary, NoteView } from "../../core/notes/noteQueries";
import { parseNoteSearchQuery } from "../../core/notes/noteSearchQuery";
import { type SearchSnippet, searchSnippetOf } from "../../core/notes/noteSearchSnippet";
import { translate } from "../i18n/translate";
import { useDevicePreferences } from "../preferences/devicePreferences";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { UnsyncedRecordsContext } from "../session/useRepositorySnapshot";
import { canDropDraggedNotebook, dropNotebook, isNotebookDrag } from "./notebookDrag";
import { acceptsNoteDrop, canDropDraggedNote, dropNoteOnView, isNoteDrag } from "./noteDrag";
import { markSidebarDropTarget, useSidebarDragState } from "./sidebarDragState";
import type { InlineNameInputProps } from "./InlineNameInput";
import { expandOrCollapseViewRow, isUnmodifiedKey } from "./sidebarKeyboard";
import { SidebarNameRow } from "./SidebarNameRow";
import { treeDepthStyle } from "./treeDepthStyle";
import { SidebarNoteRow } from "./SidebarNoteRow";
import { SidebarCount } from "./SidebarCount";
import { useMovedNotesToast } from "./useMovedNotesToast";
import type { NotesInView } from "./useNotesByView";
import { useTrashWithUndo } from "./useTrashWithUndo";
import { viewKey, type WorkspaceNavigation } from "./useWorkspaceNavigation";

// ドラッグ中に、畳んだ一覧の上にとどまってから開くまでの時間。通り過ぎるだけでは開かず、止まって待つには長すぎない長さ
//（ファイルの管理の画面で、フォルダの上にとどまると開くまでと同じくらい）。
const EXPAND_ON_DRAG_HOVER_MILLISECONDS = 600;

export type ViewGroupProps = {
  view: NoteView;
  icon: ReactNode;
  label: string;
  // 一覧ごとのメモを引く（useNotesByView）。
  notesInView: NotesInView;
  navigation: WorkspaceNavigation;
  repository: NoteRepository;
  depth?: number;
  actions?: ReactNode;
  // 行を右クリックしたとき。メニューを持つ行（ノートブック）が渡す。
  onContextMenu?: (row: HTMLElement) => void;
  childBranches?: ReactNode;
  // 中にノートブックがあるか（ノートブックの一覧だけ）。空のノートブックの見分けと、階層の線に使う。
  hasChildNotebooks?: boolean;
  // 利用者がまだ開け閉めしていないときに開いておくか。
  expandedByDefault?: boolean;
  // 行だけでなく、中のメモと入れ子の一覧を含めた範囲全体を落とし先にするか（ノートブック）。
  // ゴミ箱やテンプレートでは行だけにする（開いた中に落として、うっかりゴミ箱に入れないように）。
  dropsOnWholeGroup?: boolean;
  // 行をドラッグし始めたとき。ドラッグして動かせる行（ノートブック）が渡す。
  onDragStart?: (event: React.DragEvent) => void;
  // 名前を変えられる行（ノートブック）が渡す。onRename は F2 を押したとき。renaming を渡している間は、ラベルの位置に名前の欄を出す。
  onRename?: () => void;
  renaming?: InlineNameInputProps;
  rowButtonRef?: Ref<HTMLButtonElement>;
};

// 開くと中のメモが並ぶ 1 行。ノートブック・タグ・ゴミ箱で同じ形を使う。
export function ViewGroup(props: ViewGroupProps) {
  const { view, icon, label, notesInView, navigation, repository, depth = 0, actions, onContextMenu, childBranches, hasChildNotebooks = false, expandedByDefault = false, dropsOnWholeGroup = false, onDragStart } = props;
  const { onRename, renaming, rowButtonRef } = props;
  const moveToTrash = useTrashWithUndo(repository);
  const showMovedNotesToast = useMovedNotesToast(repository);
  const key = viewKey(view);
  const dragState = useSidebarDragState();
  // ノートブックを落とせるのは、ノートブックの一覧だけ（その中へ移す）。
  const notebookId = view.kind === "notebook" ? view.notebookId : null;
  const acceptsDraggedNotebook = () => dragState?.dragged.kind === "notebook" && notebookId !== null && canDropDraggedNotebook(notebookId, dragState, repository.notebooks());
  const acceptsDragged = () => canDropDraggedNote(view, dragState) || acceptsDraggedNotebook();
  const isDropTarget = dragState?.dropTargetKey === key && acceptsDragged();
  const isDraggedNotebook = dragState?.dragged.kind === "notebook" && dragState.dragged.notebookId === notebookId;
  const dropHandlers = acceptsNoteDrop(view) ? {
    onDragOver: (event: React.DragEvent) => {
      if (!isNoteDrag(event) && !isNotebookDrag(event)) {
        return;
      }
      // 入れ子のノートブックでは、いちばん内側の一覧だけが受ける（外側の一覧まで光らせない）。
      event.stopPropagation();
      if (acceptsDragged()) {
        event.preventDefault();
        markSidebarDropTarget(key);
      } else {
        markSidebarDropTarget(null);
      }
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (isNotebookDrag(event)) {
        // 移したノートブックが見えるよう、落とし先を開く。
        void dropNotebook(event, notebookId, repository).then((moved) => moved && navigation.setExpanded(key, true));
        return;
      }
      // 落としたメモが見えるよう、落とし先のノートブックを開く。
      void dropNoteOnView(event, view, { repository, moveToTrash, onMoved: showMovedNotesToast }).then(() => notebookId !== null && navigation.setExpanded(key, true));
    },
  } : {};
  const expanded = navigation.isExpanded(key, expandedByDefault);
  // ドラッグ中に、畳んだノートブックの上にとどまったら開く（中の入れ子のノートブックへ落とせるように）。
  // 「すべてのメモ」やゴミ箱は開かない（開くと、長い一覧がカーソルの下に出て、落としたいノートブックが押し出される）。
  const { setExpanded } = navigation;
  useEffect(() => {
    if (!isDropTarget || expanded || notebookId === null) {
      return undefined;
    }
    const timer = setTimeout(() => setExpanded(key, true), EXPAND_ON_DRAG_HOVER_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [isDropTarget, expanded, notebookId, key, setExpanded]);
  const notes = notesInView(view);
  const isActive = viewKey(navigation.view) === key;
  // 中にメモもノートブックも無いノートブックは、開いても何も出ないので、開閉の印を出さない（印の幅は残して、名前の左端をそろえる）。
  const isEmptyNotebook = notebookId !== null && notes.length === 0 && !hasChildNotebooks;
  const disclosure = <span className="disclosure">{isEmptyNotebook ? null : expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>;
  const row = renaming ? <SidebarNameRow rowKind="view" depth={depth} leading={<>{disclosure}{icon}</>} {...renaming} /> : (
    <div className={`nav-row${isDropTarget && !dropsOnWholeGroup ? " drop-target" : ""}${isDraggedNotebook ? " dragging" : ""}`} {...(dropsOnWholeGroup ? {} : dropHandlers)}
      onContextMenu={onContextMenu && ((event) => { event.preventDefault(); onContextMenu(event.currentTarget); })}>
      <button ref={rowButtonRef} className={`nav${isActive ? " active" : ""}`} style={treeDepthStyle(depth)} aria-expanded={expanded} data-view-key={key} title={label}
        draggable={onDragStart !== undefined} onDragStart={onDragStart}
        onKeyDown={(event) => {
          expandOrCollapseViewRow(event, { expanded, setExpanded: (next) => navigation.setExpanded(key, next) });
          if (onRename && isUnmodifiedKey(event, "F2")) {
            onRename();
          }
        }}
        onClick={() => {
          if (isActive) {
            navigation.setExpanded(key, !expanded);
          } else {
            navigation.selectView(view);
          }
        }}>
        {disclosure}
        {icon}
        <span className="nav-label">{label}</span>
        <SidebarCount count={notes.length} />
      </button>
      {actions && <span className="row-actions">{actions}</span>}
    </div>
  );
  const contents = expanded && (
    <>
      {childBranches}
      {/* 空のノートブックに「メモはありません」は出さない（件数を出さないことと開閉の印が無いことで分かる）。 */}
      {(notebookId === null || notes.length > 0) && <NoteRows notes={notes} view={view} navigation={navigation} repository={repository} depth={depth} />}
    </>
  );
  if (dropsOnWholeGroup) {
    // 開いていて中にノートブックがあるときは、階層の線を引く（.view-group.with-child-notebooks）。線の位置は段の深さから決める。
    const showsHierarchyLine = expanded && hasChildNotebooks;
    return (
      <div className={`view-group${isDropTarget ? " drop-target" : ""}${showsHierarchyLine ? " with-child-notebooks" : ""}`} style={treeDepthStyle(depth)} {...dropHandlers}>
        {row}{contents}
      </div>
    );
  }
  return <>{row}{contents}</>;
}

type NoteRowsProps = {
  notes: NoteSummary[];
  view: NoteView;
  navigation: WorkspaceNavigation;
  repository: NoteRepository;
  // メモが並ぶ一覧の行の、段の深さ。null は、木の外（検索の結果）。
  depth: number | null;
  // 検索の結果なら、行に添える本文の一部（当たった所）。
  snippetOf?: (summary: NoteSummary) => SearchSnippet | null;
};

export function NoteRows({ notes, view, navigation, repository, depth, snippetOf }: NoteRowsProps) {
  // 行は描き直しを省く（memo）ので、行が使う値は、変わらない限り同じものを渡す。並びが同じなら同じ配列を渡し、
  // 未送信の印は行ごとの真偽値にする（未送信の ID の Set は、スナップショットのたびに作り直される）。
  const listedNoteIdsText = notes.map(({ note }) => note.id).join(" ");
  const listedNoteIds = useMemo(() => (listedNoteIdsText === "" ? [] : listedNoteIdsText.split(" ")), [listedNoteIdsText]);
  const unsyncedIds = useContext(UnsyncedRecordsContext);
  // 言語を変えたら行の文言を入れ替える（translate は描くときに今の言語を読むので、行を描き直させる）。
  const { language } = useDevicePreferences();
  if (notes.length === 0) {
    return <div className="tree-empty" style={treeDepthStyle(depth)}>{translate("sidebar.noNotes")}</div>;
  }
  return notes.map((summary) => (
    <SidebarNoteRow key={summary.note.id} note={summary.note} view={view} listedNoteIds={listedNoteIds} depth={depth}
      activeTab={navigation.activeTab} openNote={navigation.openNote} repository={repository} unsynced={unsyncedIds.has(summary.note.id)} language={language}
      snippet={snippetOf?.(summary) ?? null} />
  ));
}

type SearchResultsProps = { summaries: NoteSummary[]; view: NoteView; navigation: WorkspaceNavigation; repository: NoteRepository };

// 検索の結果。行ごとに、本文の中で当たった所と、その前後の文を添える。
export function SearchResults({ summaries, view, navigation, repository }: SearchResultsProps) {
  const { words } = parseNoteSearchQuery(navigation.searchText);
  return (
    <>
      <div className="section-title">{translate("sidebar.searchResults", { count: summaries.length })}</div>
      {/* 当たりが無いときは、「メモはありません」ではなく、検索の結果だと分かる文にする。 */}
      {summaries.length === 0 && <div className="tree-empty unindented">{translate("sidebar.noSearchResults", { query: navigation.searchText.trim() })}</div>}
      {summaries.length > 0 && <NoteRows notes={summaries} view={view} navigation={navigation} repository={repository} depth={null}
        snippetOf={(summary) => searchSnippetOf(summary.plainText, words)} />}
    </>
  );
}

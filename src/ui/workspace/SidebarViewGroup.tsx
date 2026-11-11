// 左の列の 1 行（すべて・お気に入り・ノートブック・タグ・ゴミ箱）と、開いたときに並ぶメモ。
// メモをドラッグして行に落とすと、その一覧へ移す。

import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { type NoteSummary, type NoteView, selectNotes } from "../../core/notes/noteQueries";
import { translate } from "../i18n/translate";
import { useDevicePreferences } from "../preferences/devicePreferences";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { acceptsNoteDrop, dropNoteOnView, isNoteDrag } from "./noteDrag";
import { SidebarNoteRow } from "./SidebarNoteRow";
import { useTrashWithUndo } from "./useTrashWithUndo";
import { viewKey, type WorkspaceNavigation } from "./useWorkspaceNavigation";

// 木の 1 段ごとの字下げ。開閉の印（12px）とアイコンの間が揃う幅。
const TREE_INDENT_STEP = 14;
// 一覧の行の左の余白。.nav の padding と同じ。
const ROW_PADDING_LEFT = 8;
// メモの行は、一覧の行の開閉の印とアイコンの分だけ右に置く。
const NOTE_ROW_PADDING_LEFT = 30;

export type ViewGroupProps = {
  view: NoteView;
  icon: ReactNode;
  label: string;
  summaries: NoteSummary[];
  navigation: WorkspaceNavigation;
  repository: NoteRepository;
  depth?: number;
  actions?: ReactNode;
  // 行を右クリックしたとき。メニューを持つ行（ノートブック）が渡す。
  onContextMenu?: (row: HTMLElement) => void;
  childBranches?: ReactNode;
  // 利用者がまだ開け閉めしていないときに開いておくか。
  expandedByDefault?: boolean;
};

// 開くと中のメモが並ぶ 1 行。ノートブック・タグ・ゴミ箱で同じ形を使う。
export function ViewGroup({ view, icon, label, summaries, navigation, repository, depth = 0, actions, onContextMenu, childBranches, expandedByDefault = false }: ViewGroupProps) {
  // メモをドラッグして、この行の上に来ている間は true。
  const [droppingNote, setDroppingNote] = useState(false);
  const moveToTrash = useTrashWithUndo(repository);
  const dropNote = (event: React.DragEvent) => {
    event.preventDefault();
    setDroppingNote(false);
    void dropNoteOnView(event, view, { repository, moveToTrash });
  };
  const dropHandlers = acceptsNoteDrop(view) ? {
    onDragOver: (event: React.DragEvent) => {
      if (isNoteDrag(event)) {
        event.preventDefault();
        setDroppingNote(true);
      }
    },
    onDragLeave: () => setDroppingNote(false),
    onDrop: dropNote,
  } : {};
  const key = viewKey(view);
  const expanded = navigation.isExpanded(key, expandedByDefault);
  const { noteSortOrder } = useDevicePreferences();
  const notes = selectNotes(summaries, { view, sortOrder: noteSortOrder });
  const isActive = viewKey(navigation.view) === key;
  const indent = { paddingLeft: ROW_PADDING_LEFT + depth * TREE_INDENT_STEP };
  return (
    <>
      <div className={`nav-row${droppingNote ? " drop-target" : ""}`} {...dropHandlers}
        onContextMenu={onContextMenu && ((event) => { event.preventDefault(); onContextMenu(event.currentTarget); })}>
        <button className={`nav${isActive ? " active" : ""}`} style={indent} aria-expanded={expanded}
          onClick={() => {
            if (isActive) {
              navigation.setExpanded(key, !expanded);
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
          <NoteRows notes={notes} view={view} navigation={navigation} repository={repository} depth={depth + 1} />
        </>
      )}
    </>
  );
}

type NoteRowsProps = { notes: NoteSummary[]; view: NoteView; navigation: WorkspaceNavigation; repository: NoteRepository; depth: number };

export function NoteRows({ notes, view, navigation, repository, depth }: NoteRowsProps) {
  const paddingLeft = NOTE_ROW_PADDING_LEFT + depth * TREE_INDENT_STEP;
  if (notes.length === 0) {
    return <div className="tree-empty" style={{ paddingLeft }}>{translate("sidebar.noNotes")}</div>;
  }
  return notes.map(({ note }) => (
    <SidebarNoteRow key={note.id} note={note} view={view} paddingLeft={paddingLeft} navigation={navigation} repository={repository} />
  ));
}

type SearchResultsProps = { summaries: NoteSummary[]; view: NoteView; navigation: WorkspaceNavigation; repository: NoteRepository };

export function SearchResults({ summaries, view, navigation, repository }: SearchResultsProps) {
  return (
    <>
      <div className="section-title">{translate("sidebar.searchResults", { count: summaries.length })}</div>
      <NoteRows notes={summaries} view={view} navigation={navigation} repository={repository} depth={-1} />
    </>
  );
}

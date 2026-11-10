// 左の列の 1 行（すべて・お気に入り・ノートブック・タグ・ゴミ箱）と、開いたときに並ぶメモ。

import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useContext } from "react";
import { type NoteSummary, type NoteView, selectNotes } from "../../core/notes/noteQueries";
import { translate } from "../i18n/translate";
import { UnsyncedRecordsContext } from "../session/useRepositorySnapshot";
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
  depth?: number;
  actions?: ReactNode;
  childBranches?: ReactNode;
  // 利用者がまだ開け閉めしていないときに開いておくか。
  expandedByDefault?: boolean;
};

// 開くと中のメモが並ぶ 1 行。ノートブック・タグ・ゴミ箱で同じ形を使う。
export function ViewGroup({ view, icon, label, summaries, navigation, depth = 0, actions, childBranches, expandedByDefault = false }: ViewGroupProps) {
  const key = viewKey(view);
  const expanded = navigation.isExpanded(key, expandedByDefault);
  const notes = selectNotes(summaries, view);
  const isActive = viewKey(navigation.view) === key;
  const indent = { paddingLeft: ROW_PADDING_LEFT + depth * TREE_INDENT_STEP };
  return (
    <>
      <div className="nav-row">
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
          <NoteRows notes={notes} navigation={navigation} depth={depth + 1} />
        </>
      )}
    </>
  );
}

export function NoteRows({ notes, navigation, depth }: { notes: NoteSummary[]; navigation: WorkspaceNavigation; depth: number }) {
  const unsyncedIds = useContext(UnsyncedRecordsContext);
  if (notes.length === 0) {
    return <div className="tree-empty" style={{ paddingLeft: NOTE_ROW_PADDING_LEFT + depth * TREE_INDENT_STEP }}>{translate("sidebar.noNotes")}</div>;
  }
  return notes.map(({ note }) => (
    <button key={note.id} className={`tree-note${navigation.activeTab === note.id ? " active" : ""}`} style={{ paddingLeft: NOTE_ROW_PADDING_LEFT + depth * TREE_INDENT_STEP }}
      onClick={() => navigation.openNote(note.id)}>
      {unsyncedIds.has(note.id) && <span className="unsynced-dot" title={translate("editor.unsynced")} />}
      {note.content.title || translate("sidebar.untitled")}
    </button>
  ));
}

export function SearchResults({ summaries, navigation }: { summaries: NoteSummary[]; navigation: WorkspaceNavigation }) {
  return (
    <>
      <div className="section-title">{translate("sidebar.searchResults", { count: summaries.length })}</div>
      <NoteRows notes={summaries} navigation={navigation} depth={-1} />
    </>
  );
}

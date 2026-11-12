// グラフ表示。メモを点、メモ同士のリンクを線にした図。点を押すと、そのメモを開く。

import { useMemo } from "react";
import { buildNoteGraph, type GraphPoint, layoutNoteGraph } from "../../core/notes/noteGraph";
import type { NoteSummary } from "../../core/notes/noteQueries";
import { translate } from "../i18n/translate";

type NoteGraphViewProps = { summaries: NoteSummary[]; onOpenNote: (noteId: string) => void };

// 図の端と、いちばん外の点の間の余白（図の座標の単位）。点の名前が切れないようにする。
const GRAPH_PADDING = 60;
// 点の半径。リンクの多いメモほど大きくするが、大きくなりすぎないよう上限を置く。
const NODE_RADIUS = { minimum: 5, perLink: 1.5, maximum: 14 } as const;
// 題を出すのは、点がこの数以下のときか、リンクのあるメモだけ（多いと文字が重なって読めないため）。
const MAX_NODES_WITH_ALL_TITLES = 60;

function viewBoxOf(points: GraphPoint[]): string {
  if (points.length === 0) {
    return "0 0 100 100";
  }
  const left = Math.min(...points.map((point) => point.x)) - GRAPH_PADDING;
  const top = Math.min(...points.map((point) => point.y)) - GRAPH_PADDING;
  const right = Math.max(...points.map((point) => point.x)) + GRAPH_PADDING;
  const bottom = Math.max(...points.map((point) => point.y)) + GRAPH_PADDING;
  return `${left} ${top} ${right - left} ${bottom - top}`;
}

export function NoteGraphView({ summaries, onOpenNote }: NoteGraphViewProps) {
  // 置き方の計算は重いので、つながり（メモの ID、題、リンク）が変わったときだけやり直す。
  const graphKey = JSON.stringify(summaries.map((summary) => [summary.note.id, summary.note.content.title, summary.note.content.trashedAt, summary.note.content.isTemplate, summary.linkedNoteIds]));
  const { graph, points } = useMemo(() => {
    const built = buildNoteGraph(summaries);
    return { graph: built, points: layoutNoteGraph(built) };
    // summaries は本文を打つたびに作り直されるので、依存には、つながりを文字にしたもの（graphKey）を使う。
  }, [graphKey]);
  const showAllTitles = graph.nodes.length <= MAX_NODES_WITH_ALL_TITLES;
  return (
    <div className="note-graph">
      <div className="note-graph-summary">{translate("graph.summary", { notes: graph.nodes.length, links: graph.edges.length })}</div>
      {graph.nodes.length === 0 && <div className="tree-empty">{translate("sidebar.noNotes")}</div>}
      <svg viewBox={viewBoxOf([...points.values()])} role="img" aria-label={translate("graph.title")}>
        {graph.edges.map((edge) => {
          const [from, to] = [points.get(edge.fromNoteId)!, points.get(edge.toNoteId)!];
          return <line key={`${edge.fromNoteId}:${edge.toNoteId}`} className="note-graph-edge" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
        })}
        {graph.nodes.map((node) => {
          const point = points.get(node.noteId)!;
          const radius = Math.min(NODE_RADIUS.maximum, NODE_RADIUS.minimum + node.linkCount * NODE_RADIUS.perLink);
          const title = node.title || translate("sidebar.untitled");
          return (
            <g key={node.noteId} className="note-graph-node" role="button" tabIndex={0} aria-label={title}
              onClick={() => onOpenNote(node.noteId)} onKeyDown={(event) => event.key === "Enter" && onOpenNote(node.noteId)}>
              <title>{title}</title>
              <circle cx={point.x} cy={point.y} r={radius} />
              {(showAllTitles || node.linkCount > 0) && <text x={point.x} y={point.y + radius + 12} textAnchor="middle">{title}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

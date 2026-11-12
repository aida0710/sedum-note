// グラフ表示。メモを点、メモ同士のリンクを線にした図。点を押すと、そのメモを開く。

import { type RefObject, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildNoteGraph, type GraphPoint, layoutNoteGraph } from "../../core/notes/noteGraph";
import type { NoteSummary } from "../../core/notes/noteQueries";
import { translate } from "../i18n/translate";

type NoteGraphViewProps = { summaries: NoteSummary[]; onOpenNote: (noteId: string) => void };

// 図の端と、いちばん外の点の間の余白（px）。点の名前が切れないようにする。
const GRAPH_PADDING = 60;
// 点がまばらなときに、間を広げすぎない（点どうしを、置き方の計算の距離の何倍まで離すか）。
const MAX_SCALE = 1.5;
// 点の名前の文字の下端（ベースライン）を、点の下端からどれだけ下に置くか（px）。
const TITLE_GAP = 12;
// 点の半径。リンクの多いメモほど大きくするが、大きくなりすぎないよう上限を置く。
const NODE_RADIUS = { minimum: 5, perLink: 1.5, maximum: 14 } as const;
// 題を出すのは、点がこの数以下のときか、リンクのあるメモだけ（多いと文字が重なって読めないため）。
const MAX_NODES_WITH_ALL_TITLES = 60;

type Size = { width: number; height: number };

// 置き方の計算の座標を、図の大きさ（px）に収まる位置へ移す。図を viewBox で縮めると、点の名前の文字や点まで
// 一緒に拡大・縮小されて、ほかの画面と文字の大きさがそろわないので、位置だけを移して、文字と点は決まった大きさで描く。
function fitIntoSize(points: Map<string, GraphPoint>, { width, height }: Size): Map<string, GraphPoint> {
  const all = [...points.values()];
  // 大きさを測る前（最初の描画）は、まだ置けない。
  if (all.length === 0 || width === 0 || height === 0) {
    return points;
  }
  const left = Math.min(...all.map((point) => point.x));
  const right = Math.max(...all.map((point) => point.x));
  const top = Math.min(...all.map((point) => point.y));
  const bottom = Math.max(...all.map((point) => point.y));
  const scale = Math.min(MAX_SCALE, (width - 2 * GRAPH_PADDING) / Math.max(right - left, 1), (height - 2 * GRAPH_PADDING) / Math.max(bottom - top, 1));
  // 縮めた図を、真ん中に置く。
  const offsetX = (width - (right - left) * scale) / 2;
  const offsetY = (height - (bottom - top) * scale) / 2;
  return new Map([...points].map(([noteId, point]) => [noteId, { x: offsetX + (point.x - left) * scale, y: offsetY + (point.y - top) * scale }]));
}

// 図を描く要素の大きさ（px）。画面の大きさが変わったら測り直す。
function useElementSize<T extends Element>(): [RefObject<T | null>, Size] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
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
  const [svgRef, size] = useElementSize<SVGSVGElement>();
  const placed = useMemo(() => fitIntoSize(points, size), [points, size]);
  return (
    <div className="note-graph">
      <div className="note-graph-summary">{translate("graph.summary", { notes: graph.nodes.length, links: graph.edges.length })}</div>
      {graph.nodes.length === 0 && <div className="tree-empty">{translate("sidebar.noNotes")}</div>}
      <svg ref={svgRef} viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label={translate("graph.title")}>
        {graph.edges.map((edge) => {
          const [from, to] = [placed.get(edge.fromNoteId)!, placed.get(edge.toNoteId)!];
          return <line key={`${edge.fromNoteId}:${edge.toNoteId}`} className="note-graph-edge" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
        })}
        {graph.nodes.map((node) => {
          const point = placed.get(node.noteId)!;
          const radius = Math.min(NODE_RADIUS.maximum, NODE_RADIUS.minimum + node.linkCount * NODE_RADIUS.perLink);
          const title = node.title || translate("sidebar.untitled");
          return (
            <g key={node.noteId} className="note-graph-node" role="button" tabIndex={0} aria-label={title}
              onClick={() => onOpenNote(node.noteId)} onKeyDown={(event) => event.key === "Enter" && onOpenNote(node.noteId)}>
              <title>{title}</title>
              <circle cx={point.x} cy={point.y} r={radius} />
              {(showAllTitles || node.linkCount > 0) && <text x={point.x} y={point.y + radius + TITLE_GAP} textAnchor="middle">{title}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

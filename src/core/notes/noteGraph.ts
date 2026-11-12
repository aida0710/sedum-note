// グラフ表示（メモ同士のリンクのつながりの図）の、点と線、点の置き方。
// 置き方は、線でつながった点を引き寄せ、点どうしを離す力をくり返し当てて決める（力学モデル）。乱数を使わないので、同じメモなら同じ図になる。

import type { NoteSummary } from "./noteQueries";

export type GraphNode = { noteId: string; title: string; linkCount: number };
export type GraphEdge = { fromNoteId: string; toNoteId: string };
export type NoteGraph = { nodes: GraphNode[]; edges: GraphEdge[] };
export type GraphPoint = { x: number; y: number };

// ゴミ箱とテンプレートを除いたメモを点に、メモの中のリンクを線にする。同じ 2 つのメモの間の線は、向きに関わらず 1 本にする。
export function buildNoteGraph(summaries: NoteSummary[]): NoteGraph {
  const visible = summaries.filter((summary) => summary.note.content.trashedAt === null && !summary.note.content.isTemplate);
  const visibleIds = new Set(visible.map((summary) => summary.note.id));
  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const summary of visible) {
    for (const linkedNoteId of summary.linkedNoteIds) {
      const key = [summary.note.id, linkedNoteId].sort().join(":");
      if (linkedNoteId !== summary.note.id && visibleIds.has(linkedNoteId) && !edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push({ fromNoteId: summary.note.id, toNoteId: linkedNoteId });
      }
    }
  }
  const linkCounts = new Map<string, number>();
  for (const edge of edges) {
    linkCounts.set(edge.fromNoteId, (linkCounts.get(edge.fromNoteId) ?? 0) + 1);
    linkCounts.set(edge.toNoteId, (linkCounts.get(edge.toNoteId) ?? 0) + 1);
  }
  return { nodes: visible.map((summary) => ({ noteId: summary.note.id, title: summary.note.content.title, linkCount: linkCounts.get(summary.note.id) ?? 0 })), edges };
}

// 力をくり返し当てる回数。これ以上増やしても、数百の点では置き方がほとんど変わらない。
const LAYOUT_ITERATIONS = 200;
// 線でつながった点どうしの、落ち着く距離。図の座標の単位（画面には、全体が収まるように縮めて出す）。
const EDGE_LENGTH = 80;
// 離す力と引き寄せる力の強さ。離す力が強すぎると図が広がりすぎ、弱すぎると点が重なる。
const REPULSION = 4000;
const ATTRACTION = 0.05;
// 全部の点を中心へ寄せる弱い力。つながりの無い点が遠くへ飛んでいかないようにする。
const CENTER_PULL = 0.01;
// 1 回に動かす距離の上限。力が大きいときに、点が飛び跳ねないようにする。
const MAX_STEP = 20;

// 点の位置を決める。返すのは、メモの ID から位置への対応。
export function layoutNoteGraph(graph: NoteGraph): Map<string, GraphPoint> {
  // 最初は、円の上に順に並べる。
  const radius = EDGE_LENGTH * Math.max(1, Math.sqrt(graph.nodes.length));
  const points = graph.nodes.map((_node, index) => {
    const angle = (2 * Math.PI * index) / Math.max(1, graph.nodes.length);
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
  const indexOfNote = new Map(graph.nodes.map((node, index) => [node.noteId, index]));
  const edgeIndexes = graph.edges.map((edge) => [indexOfNote.get(edge.fromNoteId)!, indexOfNote.get(edge.toNoteId)!] as const);
  for (let iteration = 0; iteration < LAYOUT_ITERATIONS; iteration += 1) {
    const forces = points.map((point) => ({ x: -point.x * CENTER_PULL, y: -point.y * CENTER_PULL }));
    for (let left = 0; left < points.length; left += 1) {
      for (let right = left + 1; right < points.length; right += 1) {
        const dx = points[left]!.x - points[right]!.x;
        const dy = points[left]!.y - points[right]!.y;
        // 同じ位置にある点も離れるよう、距離の下限を置く。
        const distanceSquared = Math.max(dx * dx + dy * dy, 1);
        const distance = Math.sqrt(distanceSquared);
        const push = REPULSION / distanceSquared;
        forces[left]!.x += (dx / distance) * push;
        forces[left]!.y += (dy / distance) * push;
        forces[right]!.x -= (dx / distance) * push;
        forces[right]!.y -= (dy / distance) * push;
      }
    }
    for (const [from, to] of edgeIndexes) {
      const dx = points[to]!.x - points[from]!.x;
      const dy = points[to]!.y - points[from]!.y;
      const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const pull = (distance - EDGE_LENGTH) * ATTRACTION;
      forces[from]!.x += (dx / distance) * pull;
      forces[from]!.y += (dy / distance) * pull;
      forces[to]!.x -= (dx / distance) * pull;
      forces[to]!.y -= (dy / distance) * pull;
    }
    points.forEach((point, index) => {
      const force = forces[index]!;
      const length = Math.sqrt(force.x * force.x + force.y * force.y);
      const scale = length > MAX_STEP ? MAX_STEP / length : 1;
      point.x += force.x * scale;
      point.y += force.y * scale;
    });
  }
  return new Map(graph.nodes.map((node, index) => [node.noteId, points[index]!]));
}

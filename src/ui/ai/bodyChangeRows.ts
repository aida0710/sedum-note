// 本文の差し替えの案（noteTools/noteBodyChange.ts）を、承認のカードに出す差分の行にする。
// 案はブロックの単位で入れ替えるが、見せるのは行の単位にする: 入れ替えるブロックの中でも、同じ文の行は印を付けずに出し、
// 変わった行は、消す行のすぐ下に、それに代わる足す行を並べる（消す行を全部並べてから足す行を全部並べることはしない）。

import { diffBlocks } from "../noteTools/blockDiff";
import type { BodyChangeProposal } from "../noteTools/noteBodyChange";

export type BodyChangeLineRow = { kind: "context" | "removed" | "added"; text: string };
// 変わらないブロックの続き。行は出さず、行の数だけを出す。
export type BodyChangeCollapsedRow = { kind: "collapsed"; lineCount: number };
export type BodyChangeRow = BodyChangeLineRow | BodyChangeCollapsedRow;

const linesOfBlocks = (blocks: readonly string[]): string[] => blocks.flatMap((block) => block.split("\n"));

// 入れ替える所の、前の行と後の行を比べた差分の行。
function changedRows(oldLines: string[], newLines: string[]): BodyChangeLineRow[] {
  const rows: BodyChangeLineRow[] = [];
  let oldIndex = 0;
  const pushContextUntil = (oldEnd: number) => {
    for (; oldIndex < oldEnd; oldIndex += 1) {
      rows.push({ kind: "context", text: oldLines[oldIndex]! });
    }
  };
  // 行の並びの比べ方は、ブロックの並びと同じ（最長共通部分列）。
  for (const hunk of diffBlocks(oldLines, newLines)) {
    pushContextUntil(hunk.oldStart);
    const removed = oldLines.slice(hunk.oldStart, hunk.oldEnd);
    const added = newLines.slice(hunk.newStart, hunk.newEnd);
    for (let pair = 0; pair < Math.max(removed.length, added.length); pair += 1) {
      if (pair < removed.length) {
        rows.push({ kind: "removed", text: removed[pair]! });
      }
      if (pair < added.length) {
        rows.push({ kind: "added", text: added[pair]! });
      }
    }
    oldIndex = hunk.oldEnd;
  }
  pushContextUntil(oldLines.length);
  return rows;
}

export function bodyChangeRows(proposal: BodyChangeProposal): BodyChangeRow[] {
  const rows: BodyChangeRow[] = [];
  let oldBlockIndex = 0;
  const pushCollapsedUntil = (oldBlockEnd: number) => {
    const lineCount = linesOfBlocks(proposal.baseBlocks.slice(oldBlockIndex, oldBlockEnd)).length;
    if (lineCount > 0) {
      rows.push({ kind: "collapsed", lineCount });
    }
  };
  for (const hunk of proposal.hunks) {
    pushCollapsedUntil(hunk.oldStart);
    rows.push(...changedRows(linesOfBlocks(proposal.baseBlocks.slice(hunk.oldStart, hunk.oldEnd)), linesOfBlocks(proposal.newBlockMarkdowns.slice(hunk.newStart, hunk.newEnd))));
    oldBlockIndex = hunk.oldEnd;
  }
  pushCollapsedUntil(proposal.baseBlocks.length);
  return rows;
}

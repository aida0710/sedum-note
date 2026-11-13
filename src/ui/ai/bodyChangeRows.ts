// 本文の差し替えの案（noteTools/noteBodyChange.ts）を、承認のカードに出す差分の行にする。
// 案はブロックの単位で入れ替えるが、見せるのは行の単位にする: 入れ替えるブロックの中でも、同じ文の行は印を付けずに出し、
// 変わった行は、消す行のすぐ下に、それに代わる足す行を並べる（消す行を全部並べてから足す行を全部並べることはしない）。
// 行の番号は、本文の Markdown の行（段落・見出し・項目ごとに 1 行。ブロックの間の空行は数えない）の、前と後の番号。

import { diffBlocks } from "../noteTools/blockDiff";
import type { BodyChangeProposal } from "../noteTools/noteBodyChange";

// 番号の無い側は null（消す行には後の番号が、足す行には前の番号が無い）。
export type BodyChangeLineRow = { kind: "context" | "removed" | "added"; oldNumber: number | null; newNumber: number | null; text: string };
// 変わらないブロックの続き。行は出さず、行の数だけを出す。
export type BodyChangeCollapsedRow = { kind: "collapsed"; lineCount: number };
export type BodyChangeRow = BodyChangeLineRow | BodyChangeCollapsedRow;

type NumberedLine = { number: number; text: string };

// ブロックの並びを、通しの番号の付いた行にし、ブロックごとの行の並びを返す。
function numberedLinesOfBlocks(blocks: readonly string[]): NumberedLine[][] {
  let next = 1;
  return blocks.map((block) => block.split("\n").map((text) => ({ number: next++, text })));
}

// 入れ替える所の、前の行と後の行を比べた差分の行。
function changedRows(oldLines: NumberedLine[], newLines: NumberedLine[]): BodyChangeLineRow[] {
  const rows: BodyChangeLineRow[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  const pushContextUntil = (oldEnd: number) => {
    for (; oldIndex < oldEnd; oldIndex += 1, newIndex += 1) {
      rows.push({ kind: "context", oldNumber: oldLines[oldIndex]!.number, newNumber: newLines[newIndex]!.number, text: oldLines[oldIndex]!.text });
    }
  };
  // 行の並びの比べ方は、ブロックの並びと同じ（最長共通部分列）。
  for (const hunk of diffBlocks(oldLines.map((line) => line.text), newLines.map((line) => line.text))) {
    pushContextUntil(hunk.oldStart);
    const removed = oldLines.slice(hunk.oldStart, hunk.oldEnd);
    const added = newLines.slice(hunk.newStart, hunk.newEnd);
    for (let pair = 0; pair < Math.max(removed.length, added.length); pair += 1) {
      const oldLine = removed[pair];
      const newLine = added[pair];
      if (oldLine) {
        rows.push({ kind: "removed", oldNumber: oldLine.number, newNumber: null, text: oldLine.text });
      }
      if (newLine) {
        rows.push({ kind: "added", oldNumber: null, newNumber: newLine.number, text: newLine.text });
      }
    }
    oldIndex = hunk.oldEnd;
    newIndex = hunk.newEnd;
  }
  pushContextUntil(oldLines.length);
  return rows;
}

export function bodyChangeRows(proposal: BodyChangeProposal): BodyChangeRow[] {
  const oldBlocks = numberedLinesOfBlocks(proposal.baseBlocks);
  const newBlocks = numberedLinesOfBlocks(proposal.newBlockMarkdowns);
  const rows: BodyChangeRow[] = [];
  let oldBlockIndex = 0;
  const pushCollapsedUntil = (oldBlockEnd: number) => {
    const lineCount = oldBlocks.slice(oldBlockIndex, oldBlockEnd).reduce((count, lines) => count + lines.length, 0);
    if (lineCount > 0) {
      rows.push({ kind: "collapsed", lineCount });
    }
  };
  for (const hunk of proposal.hunks) {
    pushCollapsedUntil(hunk.oldStart);
    rows.push(...changedRows(oldBlocks.slice(hunk.oldStart, hunk.oldEnd).flat(), newBlocks.slice(hunk.newStart, hunk.newEnd).flat()));
    oldBlockIndex = hunk.oldEnd;
  }
  pushCollapsedUntil(proposal.baseBlocks.length);
  return rows;
}

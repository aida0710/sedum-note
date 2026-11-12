// 本文の一番上のブロックの並び（ブロックごとの Markdown）を 2 つ比べ、変わった所をまとめる。
// 同じブロックは残し、変わった所だけを入れ替えれば、Markdown に無い書式（文字色、セルの結合など）や
// ブロックの ID が、直していないブロックから落ちない。

// 前の並びの [oldStart, oldEnd) を、後ろの並びの [newStart, newEnd) に入れ替える 1 か所。
export type BlockHunk = { oldStart: number; oldEnd: number; newStart: number; newEnd: number };

// 最長共通部分列で、同じまま残るブロックを決め、その間を入れ替える所にする。前から順に並べて返す。
export function diffBlocks(oldBlocks: readonly string[], newBlocks: readonly string[]): BlockHunk[] {
  // common[i][j] は、oldBlocks[i..] と newBlocks[j..] の共通部分列の長さ。
  const common = Array.from({ length: oldBlocks.length + 1 }, () => new Array<number>(newBlocks.length + 1).fill(0));
  for (let i = oldBlocks.length - 1; i >= 0; i -= 1) {
    for (let j = newBlocks.length - 1; j >= 0; j -= 1) {
      common[i]![j] = oldBlocks[i] === newBlocks[j] ? common[i + 1]![j + 1]! + 1 : Math.max(common[i + 1]![j]!, common[i]![j + 1]!);
    }
  }
  const hunks: BlockHunk[] = [];
  let open: BlockHunk | null = null;
  let i = 0;
  let j = 0;
  while (i < oldBlocks.length || j < newBlocks.length) {
    if (i < oldBlocks.length && j < newBlocks.length && oldBlocks[i] === newBlocks[j]) {
      if (open) {
        hunks.push(open);
        open = null;
      }
      i += 1;
      j += 1;
      continue;
    }
    open ??= { oldStart: i, oldEnd: i, newStart: j, newEnd: j };
    // 足す方と消す方のうち、残せる共通部分が長くなる方へ進む。
    if (j < newBlocks.length && (i === oldBlocks.length || common[i]![j + 1]! >= common[i + 1]![j]!)) {
      j += 1;
      open.newEnd = j;
    } else {
      i += 1;
      open.oldEnd = i;
    }
  }
  if (open) {
    hunks.push(open);
  }
  return hunks;
}

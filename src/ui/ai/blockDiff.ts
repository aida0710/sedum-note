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

// 元のブロックの並びと、新しいブロックの並びを、元のブロックの単位で突き合わせる。
// 元のブロックは、Markdown に戻して読み直すと形が変わることがある（段組みは段ごとのブロックに分かれる、など）。
// そこで、元のブロック i を読み直した形（roundTrips[i]。0 個以上のブロック）で新しい並びと比べ、読み直した形が
// 全部そのまま新しい並びに続いて現れたブロックは、変わっていないものとして残す（元のブロックを、書式ごと残せる）。
// 読み直した形が 0 個のブロック（Markdown に出せないもの）は、新しい並びに現れようがないので、いつも残す。
// 返す所は、元のブロックの番号と、新しい並びの番号で表す。
export function alignBlocks(roundTrips: readonly (readonly string[])[], newBlocks: readonly string[]): BlockHunk[] {
  const flattened = roundTrips.flatMap((group, owner) => group.map((markdown) => ({ markdown, owner })));
  const flatHunks = diffBlocks(flattened.map((entry) => entry.markdown), newBlocks);
  // 読み直した形のそれぞれが、新しい並びのどれと同じだったか（変わった所に入ったものは null）。
  const matchedNewIndex: (number | null)[] = new Array<number | null>(flattened.length).fill(null);
  let flatIndex = 0;
  let newIndex = 0;
  for (const hunk of [...flatHunks, { oldStart: flattened.length, oldEnd: flattened.length, newStart: newBlocks.length, newEnd: newBlocks.length }]) {
    for (; flatIndex < hunk.oldStart; flatIndex += 1, newIndex += 1) {
      matchedNewIndex[flatIndex] = newIndex;
    }
    flatIndex = hunk.oldEnd;
    newIndex = hunk.newEnd;
  }
  // 元のブロックごとに、残すなら新しい並びのどこからどこまでに当たるか。残さないなら null。
  const keptRanges: Array<{ start: number; end: number } | "empty" | null> = roundTrips.map(() => null);
  let position = 0;
  roundTrips.forEach((group, owner) => {
    const matched = matchedNewIndex.slice(position, position + group.length);
    position += group.length;
    if (group.length === 0) {
      keptRanges[owner] = "empty";
      return;
    }
    const start = matched[0];
    const isContiguous = start !== null && start !== undefined && matched.every((index, offset) => index === start + offset);
    keptRanges[owner] = isContiguous ? { start, end: start + group.length } : null;
  });
  const hunks: BlockHunk[] = [];
  let newCursor = 0;
  let owner = 0;
  while (owner < roundTrips.length) {
    const kept = keptRanges[owner] ?? null;
    if (kept !== null) {
      if (kept !== "empty") {
        if (kept.start > newCursor) {
          hunks.push({ oldStart: owner, oldEnd: owner, newStart: newCursor, newEnd: kept.start });
        }
        newCursor = kept.end;
      }
      owner += 1;
      continue;
    }
    const start = owner;
    while (owner < roundTrips.length && keptRanges[owner] === null) {
      owner += 1;
    }
    const next = keptRanges.slice(owner).find((range): range is { start: number; end: number } => range !== null && range !== "empty");
    const replacementEnd = next ? next.start : newBlocks.length;
    hunks.push({ oldStart: start, oldEnd: owner, newStart: newCursor, newEnd: replacementEnd });
    newCursor = replacementEnd;
  }
  if (newCursor < newBlocks.length) {
    hunks.push({ oldStart: roundTrips.length, oldEnd: roundTrips.length, newStart: newCursor, newEnd: newBlocks.length });
  }
  return hunks;
}

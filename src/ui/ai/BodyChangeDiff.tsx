// 本文の差し替えの案（noteTools/noteBodyChange.ts）の差分。git の差分と同じく、消す行の頭に「-」、足す行の頭に「+」を
// 付けて詰めて並べ、変わらない所は数だけを出す。消すブロックは <del>、足すブロックは <ins> にする（読み上げでも区別できる）。

import { translate } from "../i18n/translate";
import type { BodyChangeProposal } from "../noteTools/noteBodyChange";

// 差分の並び。変わっていない所は、数だけを出す。
type DiffSegment = { kind: "unchanged"; count: number } | { kind: "changed"; removed: string[]; added: string[] };

function diffSegments(proposal: BodyChangeProposal): DiffSegment[] {
  const segments: DiffSegment[] = [];
  let oldIndex = 0;
  const pushUnchanged = (until: number) => {
    if (until > oldIndex) {
      segments.push({ kind: "unchanged", count: until - oldIndex });
    }
  };
  for (const hunk of proposal.hunks) {
    pushUnchanged(hunk.oldStart);
    segments.push({ kind: "changed", removed: proposal.baseBlocks.slice(hunk.oldStart, hunk.oldEnd), added: proposal.newBlockMarkdowns.slice(hunk.newStart, hunk.newEnd) });
    oldIndex = hunk.oldEnd;
  }
  pushUnchanged(proposal.baseBlocks.length);
  return segments;
}

// 1 つのブロックの Markdown を、行ごとに並べる（行の頭の「-」「+」は CSS で付け、文字には入れない）。
function BlockLines({ markdown }: { markdown: string }) {
  return <>{markdown.split("\n").map((line, index) => <span key={index} className="ai-diff-line">{line}</span>)}</>;
}

export function BodyChangeDiff({ proposal }: { proposal: BodyChangeProposal }) {
  if (proposal.hunks.length === 0) {
    return <p className="hint">{translate("ai.edit.noChange")}</p>;
  }
  return (
    <div className="ai-edit-diff">
      {diffSegments(proposal).map((segment, index) => (segment.kind === "unchanged"
        ? <div key={index} className="ai-edit-unchanged">{translate("ai.edit.unchangedBlocks", { count: String(segment.count) })}</div>
        : (
          <div key={index}>
            {segment.removed.map((block, blockIndex) => (
              <del key={`removed-${blockIndex}`} className="ai-edit-removed" aria-label={translate("ai.edit.removed")}><BlockLines markdown={block} /></del>
            ))}
            {segment.added.map((block, blockIndex) => (
              <ins key={`added-${blockIndex}`} className="ai-edit-added" aria-label={translate("ai.edit.added")}><BlockLines markdown={block} /></ins>
            ))}
          </div>
        )))}
    </div>
  );
}

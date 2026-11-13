// 本文の差し替えの案（noteTools/noteBodyChange.ts）の差分。行ごとに、印（消す行は「-」、足す行は「+」）と文を詰めて並べる。
// どの行をどう並べるかは bodyChangeRows.ts が決める。消す行は <del>、足す行は <ins> にする（読み上げでも区別できる）。
// 印は CSS で出し、文字には入れない（コピーしたときに文だけになる）。

import { translate } from "../i18n/translate";
import type { BodyChangeProposal } from "../noteTools/noteBodyChange";
import { type BodyChangeRow, bodyChangeRows } from "./bodyChangeRows";

function DiffRow({ row }: { row: BodyChangeRow }) {
  if (row.kind === "collapsed") {
    return <div className="ai-diff-collapsed">{translate("ai.edit.unchangedLines", { count: row.lineCount })}</div>;
  }
  if (row.kind === "removed") {
    return <del className="ai-diff-row ai-edit-removed" aria-label={translate("ai.edit.removed")}>{row.text}</del>;
  }
  if (row.kind === "added") {
    return <ins className="ai-diff-row ai-edit-added" aria-label={translate("ai.edit.added")}>{row.text}</ins>;
  }
  return <div className="ai-diff-row">{row.text}</div>;
}

export function BodyChangeDiff({ proposal }: { proposal: BodyChangeProposal }) {
  if (proposal.hunks.length === 0) {
    return <p className="hint">{translate("ai.edit.noChange")}</p>;
  }
  return (
    <div className="ai-edit-diff">
      {bodyChangeRows(proposal).map((row, index) => <DiffRow key={index} row={row} />)}
    </div>
  );
}

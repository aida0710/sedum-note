// 本文の差し替えの案（noteTools/noteBodyChange.ts）の差分。行ごとに、前と後の行の番号、印（消す行は「-」、足す行は「+」）、
// 文を詰めて並べる。どの行をどう並べるかは bodyChangeRows.ts が決める。消す行は <del>、足す行は <ins> にする
// （読み上げでも区別できる）。番号と印は CSS で出し、文字には入れない（コピーしたときに文だけになる）。

import type { CSSProperties } from "react";
import { translate } from "../i18n/translate";
import type { BodyChangeProposal } from "../noteTools/noteBodyChange";
import { type BodyChangeRow, bodyChangeRows } from "./bodyChangeRows";

function DiffRow({ row }: { row: BodyChangeRow }) {
  if (row.kind === "collapsed") {
    return <div className="ai-diff-collapsed">{translate("ai.edit.unchangedLines", { count: row.lineCount })}</div>;
  }
  const cells = (
    <>
      <span className="ai-diff-number" data-number={row.oldNumber ?? ""} />
      <span className="ai-diff-number" data-number={row.newNumber ?? ""} />
      <span className="ai-diff-text">{row.text}</span>
    </>
  );
  if (row.kind === "removed") {
    return <del className="ai-diff-row ai-edit-removed" aria-label={translate("ai.edit.removed")}>{cells}</del>;
  }
  if (row.kind === "added") {
    return <ins className="ai-diff-row ai-edit-added" aria-label={translate("ai.edit.added")}>{cells}</ins>;
  }
  return <div className="ai-diff-row">{cells}</div>;
}

export function BodyChangeDiff({ proposal }: { proposal: BodyChangeProposal }) {
  if (proposal.hunks.length === 0) {
    return <p className="hint">{translate("ai.edit.noChange")}</p>;
  }
  const rows = bodyChangeRows(proposal);
  // 番号の列の幅は、いちばん大きい番号の桁の数に合わせる。
  const largestNumber = Math.max(1, ...rows.flatMap((row) => (row.kind === "collapsed" ? [] : [row.oldNumber ?? 0, row.newNumber ?? 0])));
  const numberDigits = { "--diff-number-digits": String(largestNumber).length } as CSSProperties;
  return (
    <div className="ai-edit-diff" style={numberDigits}>
      {rows.map((row, index) => <DiffRow key={index} row={row} />)}
    </div>
  );
}

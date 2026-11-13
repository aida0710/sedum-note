// AI の答えに付いた、メモの直しの案。消すブロックと足すブロックを差分で見せ、適用するかを選ばせる。

import { PencilLine } from "lucide-react";
import { translate } from "../i18n/translate";
import type { BlockHunk } from "../noteTools/blockDiff";
import type { AiNoteEdit } from "./aiConversation";
import type { NoteEditProposal } from "./noteEditProposal";

type NoteEditCardProps = {
  edit: AiNoteEdit;
  // 案の中身。会話を開き直したあとや、別の画面で受け取った案は持っていないので null。
  proposal: NoteEditProposal | null;
  // 案のメモをエディタで開いていて、書き換えられるか（適用はエディタを通して行う）。
  canApply: boolean;
  busy: boolean;
  onApply: () => void;
  onReject: () => void;
};

// 差分の並び。変わっていない所は、数だけを出す。
type DiffSegment = { kind: "unchanged"; count: number } | { kind: "changed"; removed: string[]; added: string[] };

function diffSegments(proposal: NoteEditProposal): DiffSegment[] {
  const segments: DiffSegment[] = [];
  let oldIndex = 0;
  const pushUnchanged = (until: number) => {
    if (until > oldIndex) {
      segments.push({ kind: "unchanged", count: until - oldIndex });
    }
  };
  proposal.hunks.forEach((hunk: BlockHunk) => {
    pushUnchanged(hunk.oldStart);
    segments.push({ kind: "changed", removed: proposal.baseBlocks.slice(hunk.oldStart, hunk.oldEnd), added: proposal.newBlockMarkdowns.slice(hunk.newStart, hunk.newEnd) });
    oldIndex = hunk.oldEnd;
  });
  pushUnchanged(proposal.baseBlocks.length);
  return segments;
}

export function NoteEditCard({ edit, proposal, canApply, busy, onApply, onReject }: NoteEditCardProps) {
  return (
    <div className="ai-edit" aria-label={translate("ai.edit.label")}>
      <div className="ai-edit-summary"><PencilLine size={14} />{edit.summary}</div>
      {proposal && (
        <div className="ai-edit-diff">
          {proposal.hunks.length === 0 && <p className="hint">{translate("ai.edit.noChange")}</p>}
          {diffSegments(proposal).map((segment, index) => (segment.kind === "unchanged"
            ? <div key={index} className="ai-edit-unchanged">{translate("ai.edit.unchangedBlocks", { count: String(segment.count) })}</div>
            : (
              <div key={index} className="ai-edit-hunk">
                {segment.removed.map((block, blockIndex) => <pre key={`removed-${blockIndex}`} className="ai-edit-removed" aria-label={translate("ai.edit.removed")}>{block}</pre>)}
                {segment.added.map((block, blockIndex) => <pre key={`added-${blockIndex}`} className="ai-edit-added" aria-label={translate("ai.edit.added")}>{block}</pre>)}
              </div>
            )))}
        </div>
      )}
      <EditStatus edit={edit} hasProposal={proposal !== null} canApply={canApply} busy={busy} onApply={onApply} onReject={onReject} />
    </div>
  );
}

type EditStatusProps = Omit<NoteEditCardProps, "proposal"> & { hasProposal: boolean };

function EditStatus({ edit, hasProposal, canApply, busy, onApply, onReject }: EditStatusProps) {
  if (edit.status === "applied") {
    return <p className="ai-edit-status">{translate("ai.edit.applied")}</p>;
  }
  if (edit.status === "rejected") {
    return <p className="ai-edit-status">{translate("ai.edit.rejected")}</p>;
  }
  if (edit.status === "stale") {
    return <p className="ai-edit-status">{translate("ai.edit.stale")}</p>;
  }
  if (!hasProposal) {
    return <p className="ai-edit-status">{translate("ai.edit.unavailable")}</p>;
  }
  return (
    <div className="ai-edit-actions">
      {!canApply && <span className="hint">{translate("ai.edit.openNoteToApply")}</span>}
      <button type="button" className="secondary-button" disabled={busy} onClick={onReject}>{translate("ai.edit.reject")}</button>
      <button type="button" className="primary-button" disabled={busy || !canApply} onClick={onApply}>{translate("ai.edit.apply")}</button>
    </div>
  );
}

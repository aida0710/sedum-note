// AI の 1 つの答えの、承認を待っている変更をまとめた 1 枚のカード。項目ごとに中身（本文は差分、題などは前と後）を見せ、
// 選んだものだけを行うか、すべて行わないかを選ばせる。

import { ShieldQuestion } from "lucide-react";
import { useState } from "react";
import { translate } from "../i18n/translate";
import { BodyChangeDiff } from "./BodyChangeDiff";
import type { AiApprovalItem } from "./aiToolCalls";
import { toolCallDescription, updatedFieldText } from "./aiToolActivityText";
import type { PendingAiApproval } from "./useAiChatTurn";

const CARD_ICON_SIZE = 14;

// ピンとブックマークの前と後は "yes" / "no" で届く（noteTools/noteChangeTools.ts）。
function changedValueText(field: string, value: string): string {
  if (field === "pinned" || field === "bookmarked") {
    return translate(value === "yes" ? "ai.approval.on" : "ai.approval.off");
  }
  return value === "" ? translate("ai.approval.none") : value;
}

function ApprovalDetails({ item }: { item: AiApprovalItem }) {
  const { preview } = item;
  if (item.bodyChange) {
    return <BodyChangeDiff proposal={item.bodyChange} />;
  }
  switch (preview.kind) {
    case "createNote":
      return <p className="hint">{translate("ai.approval.createNote", { count: preview.characterCount, notebooks: preview.notebookNames.join(", ") || translate("ai.approval.none") })}</p>;
    case "updateNote":
      return (
        <ul className="ai-approval-changes">
          {preview.changes.map((change) => (
            <li key={change.field}>{translate("ai.approval.change", { field: updatedFieldText(change.field), before: changedValueText(change.field, change.before), after: changedValueText(change.field, change.after) })}</li>
          ))}
        </ul>
      );
    case "moveNoteToTrash":
      return <p className="hint">{translate("ai.approval.trashNote")}</p>;
    case "deleteNotebook":
      return <p className="hint">{translate("ai.approval.deleteNotebook", { noteCount: preview.noteCount, childCount: preview.childCount })}</p>;
    case "deleteNotePermanently":
      return <p className="hint danger-text">{translate("ai.approval.deleteNotePermanently")}</p>;
    default:
      return null;
  }
}

export function AiApprovalCard({ approval }: { approval: PendingAiApproval }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(approval.items.map((item) => item.toolCallId)));
  const isSingle = approval.items.length === 1;
  const toggle = (toolCallId: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) {
      next.add(toolCallId);
    } else {
      next.delete(toolCallId);
    }
    setSelected(next);
  };
  return (
    <div className="ai-edit ai-approval" role="group" aria-label={translate("ai.approval.label")}>
      <div className="ai-edit-summary"><ShieldQuestion size={CARD_ICON_SIZE} />{translate("ai.approval.title")}</div>
      {approval.items.map((item) => (
        <div key={item.toolCallId} className="ai-approval-item">
          {isSingle
            ? <div className="ai-approval-description">{toolCallDescription(item.preview, item.toolName)}</div>
            : (
              <label className="checkbox-line ai-approval-description">
                <input type="checkbox" checked={selected.has(item.toolCallId)} onChange={(event) => toggle(item.toolCallId, event.target.checked)} />
                {toolCallDescription(item.preview, item.toolName)}
              </label>
            )}
          <ApprovalDetails item={item} />
        </div>
      ))}
      <div className="ai-edit-actions">
        <button type="button" className="secondary-button" onClick={() => approval.decide(new Set())}>
          {translate(isSingle ? "ai.approval.reject" : "ai.approval.rejectAll")}
        </button>
        <button type="button" className="primary-button" disabled={selected.size === 0} onClick={() => approval.decide(selected)}>
          {translate(isSingle ? "ai.approval.apply" : "ai.approval.applySelected")}
        </button>
      </div>
    </div>
  );
}

// 添付（写真・音声）を読めなかったときの案内。まだ届いていないのか、読み込みに失敗したのかを分けて伝え、読み直すボタンを置く。

import { RotateCw } from "lucide-react";
import { translate } from "../i18n/translate";
import type { AttachmentUnavailableReason } from "./attachmentReader";
import { ICON_SIZE } from "../shared/iconSizes";

const REASON_MESSAGES = {
  notDelivered: "editor.attachmentNotDelivered",
  failed: "editor.attachmentLoadFailed",
} as const;

type AttachmentUnavailableProps = { reason: AttachmentUnavailableReason; onReload: () => void; className: string };

export function AttachmentUnavailable({ reason, onReload, className }: AttachmentUnavailableProps) {
  return (
    <div className={`attachment-unavailable ${className}`} role="status">
      <span>{translate(REASON_MESSAGES[reason])}</span>
      <button type="button" className="secondary-button" onClick={onReload}><RotateCw size={ICON_SIZE.row} />{translate("editor.reloadAttachment")}</button>
    </div>
  );
}

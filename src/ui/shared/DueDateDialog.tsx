// 期限の日時を選ぶダイアログ。メモの期限と、チェックリストの項目の期限の両方で使う。

import { useState } from "react";
import { DEFAULT_DUE_TIME_OF_DAY, dueTimeOf, isDueTime } from "../../core/notes/dueTimes";
import { translate } from "../i18n/translate";
import { ModalDialog } from "./ModalDialog";

type DueDateDialogProps = {
  title: string;
  // 今の期限。まだ無ければ null。
  dueAt: string | null;
  // null を渡すと、期限を外す。
  onSave: (dueAt: string | null) => void;
  onClose: () => void;
};

// まだ期限が無いときに、最初に出しておく日時（明日の朝）。
function tomorrowMorning(): string {
  const [hour, minute] = DEFAULT_DUE_TIME_OF_DAY.split(":").map(Number) as [number, number];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(hour, minute, 0, 0);
  return dueTimeOf(tomorrow);
}

export function DueDateDialog({ title, dueAt, onSave, onClose }: DueDateDialogProps) {
  // datetime-local の値は、期限の形（YYYY-MM-DDTHH:MM）と同じ。
  const [value, setValue] = useState(dueAt ?? tomorrowMorning());
  return (
    <ModalDialog label={title} title={title} onClose={onClose}>
      <form className="dialog-form" onSubmit={(event) => { event.preventDefault(); onSave(value); }}>
        <div className="field">
          <label htmlFor="due-date-time">{translate("due.dateTime")}</label>
          <input id="due-date-time" type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} autoFocus required />
        </div>
        <div className="form-actions">
          {dueAt !== null && <button type="button" className="danger-button" onClick={() => onSave(null)}>{translate("due.remove")}</button>}
          <button type="button" className="secondary-button" onClick={onClose}>{translate("common.cancel")}</button>
          <button type="submit" className="primary-button" disabled={!isDueTime(value)}>{translate("common.save")}</button>
        </div>
      </form>
    </ModalDialog>
  );
}

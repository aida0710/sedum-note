// 設定: ゴミ箱のメモを、日数がたったら完全に削除するか。

import { useState } from "react";
import { translate } from "../i18n/translate";
import { isTrashRetentionDays, TRASH_RETENTION_DAYS_RANGE, updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";

// 自動削除を有効にしたときに、最初に入れておく日数。
const INITIAL_RETENTION_DAYS = 30;

export function TrashSection() {
  const { trashRetentionDays } = useDevicePreferences();
  // 入力の途中（空や範囲の外）も表示できるよう、文字のまま持つ。
  const [daysText, setDaysText] = useState(String(trashRetentionDays ?? INITIAL_RETENTION_DAYS));
  const enabled = trashRetentionDays !== null;
  const typedDays = Number(daysText);
  const changeDays = (text: string) => {
    setDaysText(text);
    if (isTrashRetentionDays(Number(text))) {
      updateDevicePreferences({ trashRetentionDays: Number(text) });
    }
  };
  return (
    <section className="settings-section">
      <h2>{translate("settings.trash")}</h2>
      <label className="checkbox-line">
        <input type="checkbox" checked={enabled}
          onChange={(event) => updateDevicePreferences({ trashRetentionDays: event.target.checked && isTrashRetentionDays(typedDays) ? typedDays : null })} />
        {translate("trash.autoDelete")}
      </label>
      {enabled && (
        <div className="field">
          <label htmlFor="trash-retention-days">{translate("trash.retentionDays")}</label>
          <input id="trash-retention-days" type="number" inputMode="numeric" min={TRASH_RETENTION_DAYS_RANGE.minimum} max={TRASH_RETENTION_DAYS_RANGE.maximum}
            value={daysText} onChange={(event) => changeDays(event.target.value)} />
          {!isTrashRetentionDays(typedDays) && (
            <span className="form-error" role="alert">{translate("trash.retentionDaysInvalid", TRASH_RETENTION_DAYS_RANGE)}</span>
          )}
        </div>
      )}
      <p>{translate("trash.autoDeleteDescription")}</p>
    </section>
  );
}

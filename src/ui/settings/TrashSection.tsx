// 設定: ゴミ箱のメモを、日数がたったら完全に削除するか。

import { useState } from "react";
import { translate } from "../i18n/translate";
import { isTrashRetentionDays, TRASH_RETENTION_DAYS_RANGE, updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { SettingCheckboxRow, SettingRow } from "./SettingRow";

// 自動削除を有効にしたときに、最初に入れておく日数。
const INITIAL_RETENTION_DAYS = 30;

export function TrashSection() {
  const { trashRetentionDays } = useDevicePreferences();
  // 打っている途中の値では確定しない（「365」と打つ途中の「3」で、3 日より古いゴミが消えてしまう）。
  // 欄を離れたときか Enter で確定する。入力の途中（空や範囲の外）も表示できるよう、文字のまま持つ。
  const [daysText, setDaysText] = useState(String(trashRetentionDays ?? INITIAL_RETENTION_DAYS));
  const enabled = trashRetentionDays !== null;
  const typedDays = Number(daysText);
  const commitDays = () => {
    if (isTrashRetentionDays(typedDays)) {
      updateDevicePreferences({ trashRetentionDays: typedDays });
    }
  };
  return (
    <section className="settings-section">
      <h2>{translate("settings.trash")}</h2>
      <SettingCheckboxRow controlId="trash-auto-delete" label={translate("trash.autoDelete")} hint={translate("trash.autoDeleteDescription")} checked={enabled}
        onChange={(checked) => updateDevicePreferences({ trashRetentionDays: checked && isTrashRetentionDays(typedDays) ? typedDays : null })} />
      {enabled && (
        <>
          <SettingRow controlId="trash-retention-days" label={translate("trash.retentionDays")} hint={translate("trash.retentionDaysHint", { days: trashRetentionDays })}>
            {(control) => (
              <input {...control} type="number" inputMode="numeric" min={TRASH_RETENTION_DAYS_RANGE.minimum} max={TRASH_RETENTION_DAYS_RANGE.maximum}
                value={daysText} onChange={(event) => setDaysText(event.target.value)} onBlur={commitDays}
                onKeyDown={(event) => event.key === "Enter" && !isImeKeyEvent(event.nativeEvent) && commitDays()} />
            )}
          </SettingRow>
          {!isTrashRetentionDays(typedDays) && (
            <span className="form-error" role="alert">{translate("trash.retentionDaysInvalid", TRASH_RETENTION_DAYS_RANGE)}</span>
          )}
        </>
      )}
    </section>
  );
}

// 設定: ゴミ箱のメモを、日数がたったら完全に削除するか。
// 有効にしたときと日数を変えたときは、すぐに削除が走る。その時点で消えるメモがあれば、件数を出して確かめてから決める。

import { useState } from "react";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { expiredTrashNotes } from "../../core/notes/trashRetention";
import { translate } from "../i18n/translate";
import { isTrashRetentionDays, TRASH_RETENTION_DAYS_RANGE, updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { useDialogs } from "../shared/DialogProvider";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { SettingCheckboxRow, SettingRow } from "./SettingRow";

// 自動削除を有効にしたときに、最初に入れておく日数。
const INITIAL_RETENTION_DAYS = 30;

export function TrashSection({ repository }: { repository: NoteRepository }) {
  const { trashRetentionDays } = useDevicePreferences();
  const dialogs = useDialogs();
  // 打っている途中の値では決めない（「365」と打つ途中の「3」で、3 日より古いゴミが消えてしまう）。Enter か「保存」で決める。
  // 入力の途中（空や範囲の外）も表示できるよう、文字のまま持つ。
  const [daysText, setDaysText] = useState(String(trashRetentionDays ?? INITIAL_RETENTION_DAYS));
  const enabled = trashRetentionDays !== null;
  const typedDays = Number(daysText);
  const typedDaysAreValid = isTrashRetentionDays(typedDays);

  // この日数で決めると、いま消えるメモがあれば、その件数を出して確かめる。
  const applyRetentionDays = async (days: number) => {
    const expiredCount = expiredTrashNotes(repository.notes(), days, new Date()).length;
    const accepted = expiredCount === 0 || await dialogs.confirm({
      message: translate("trash.removeExpiredConfirm", { days, count: expiredCount }),
      confirmLabel: translate("trash.removeExpiredConfirmLabel"),
      danger: true,
    });
    if (accepted) {
      updateDevicePreferences({ trashRetentionDays: days });
    }
  };
  const turnOn = () => {
    const days = typedDaysAreValid ? typedDays : INITIAL_RETENTION_DAYS;
    setDaysText(String(days));
    void applyRetentionDays(days);
  };
  const saveDays = () => {
    if (typedDaysAreValid && typedDays !== trashRetentionDays) {
      void applyRetentionDays(typedDays);
    }
  };
  const saveDaysOnEnter = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !isImeKeyEvent(event.nativeEvent)) {
      // 確かめのダイアログが開くと、フォーカスはその決めるボタンへ移る。既定の動作を止めないと、ブラウザはこの Enter の続きを
      // そのボタンへ送り、確かめる前に決めたことになる。
      event.preventDefault();
      saveDays();
    }
  };
  return (
    <section className="settings-section">
      <h2>{translate("settings.trash")}</h2>
      <SettingCheckboxRow controlId="trash-auto-delete" label={translate("trash.autoDelete")} hint={translate("trash.autoDeleteDescription")} checked={enabled}
        onChange={(checked) => (checked ? turnOn() : updateDevicePreferences({ trashRetentionDays: null }))} />
      {enabled && (
        <>
          <SettingRow controlId="trash-retention-days" label={translate("trash.retentionDays")} hint={translate("trash.retentionDaysHint", { days: trashRetentionDays })}>
            {(control) => (
              <span className="setting-inline-save">
                <input {...control} type="number" inputMode="numeric" min={TRASH_RETENTION_DAYS_RANGE.minimum} max={TRASH_RETENTION_DAYS_RANGE.maximum}
                  value={daysText} onChange={(event) => setDaysText(event.target.value)} onKeyDown={saveDaysOnEnter} />
                <button type="button" className="secondary-button" disabled={!typedDaysAreValid || typedDays === trashRetentionDays} onClick={saveDays}>
                  {translate("common.save")}
                </button>
              </span>
            )}
          </SettingRow>
          {!typedDaysAreValid && (
            <span className="form-error" role="alert">{translate("trash.retentionDaysInvalid", TRASH_RETENTION_DAYS_RANGE)}</span>
          )}
        </>
      )}
    </section>
  );
}

// 設定: 操作が無いときに自動でロックするまでの時間（このデバイスだけの設定）。選択肢は選んだ時点で保存する。「時間を指定」では、
// 数と単位を入れて、Enter か「保存」で決める（打っている途中の値では決めない）。

import { useState } from "react";
import { translate } from "../i18n/translate";
import {
  inactivityLockAmountOf, INACTIVITY_LOCK_PRESET_MINUTES, INACTIVITY_LOCK_UNITS, type InactivityLockUnit, isPresetInactivityLockMinutes, parseInactivityLockInput,
} from "../preferences/inactivityLockMinutes";
import { updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { SettingRow } from "./SettingRow";

// 選択欄の「しない」と「時間を指定」の値。ほかの選択肢の値は分の数。
const NEVER_CHOICE = "never";
const CUSTOM_CHOICE = "custom";
// 「時間を指定」を初めて開いたときに入れておく時間（分）。選択肢に無い長さにして、指定する欄だと分かるようにする。
const INITIAL_CUSTOM_MINUTES = 30;

const UNIT_LABELS = { minutes: "inactivityLock.unitMinutes", hours: "inactivityLock.unitHours" } as const;
const INVALID_MESSAGES = { notWholeNumber: "inactivityLock.notWholeNumber", outOfRange: "inactivityLock.outOfRange" } as const;

// 時間を、選択肢と同じ形の文字にする（「15分」「3時間」）。
function durationLabel(minutes: number): string {
  const { amount, unit } = inactivityLockAmountOf(minutes);
  return translate(unit === "hours" ? "inactivityLock.hoursOption" : "inactivityLock.minutesOption", { count: amount });
}

export function InactivityLockSetting() {
  const { inactivityLockMinutes } = useDevicePreferences();
  // 選択肢に無い時間を保存してあれば、最初から「時間を指定」の欄を出す。
  const [choosesCustom, setChoosesCustom] = useState(inactivityLockMinutes !== null && !isPresetInactivityLockMinutes(inactivityLockMinutes));
  // 指定の欄に最初に入れておく値。今の設定があればそれ。
  const amountToShow = () => inactivityLockAmountOf(inactivityLockMinutes ?? INITIAL_CUSTOM_MINUTES);
  const [amountText, setAmountText] = useState(() => String(amountToShow().amount));
  const [unit, setUnit] = useState<InactivityLockUnit>(() => amountToShow().unit);
  const typed = parseInactivityLockInput(amountText, unit);
  const typedMinutes = "minutes" in typed ? typed.minutes : null;

  const selectedChoice = choosesCustom ? CUSTOM_CHOICE : inactivityLockMinutes === null ? NEVER_CHOICE : String(inactivityLockMinutes);
  const choose = (choice: string) => {
    setChoosesCustom(choice === CUSTOM_CHOICE);
    if (choice === CUSTOM_CHOICE) {
      const { amount, unit: unitToShow } = amountToShow();
      setAmountText(String(amount));
      setUnit(unitToShow);
    } else if (choice === NEVER_CHOICE) {
      updateDevicePreferences({ inactivityLockMinutes: null });
    } else {
      updateDevicePreferences({ inactivityLockMinutes: Number(choice) });
    }
  };
  const saveCustom = () => {
    if (typedMinutes !== null && typedMinutes !== inactivityLockMinutes) {
      updateDevicePreferences({ inactivityLockMinutes: typedMinutes });
    }
  };
  const saveCustomOnEnter = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !isImeKeyEvent(event.nativeEvent)) {
      event.preventDefault();
      saveCustom();
    }
  };
  return (
    <>
      <SettingRow controlId="inactivity-lock" label={translate("settings.inactivityLock")} hint={translate("settings.inactivityLockHint")}>
        {(control) => (
          <select {...control} value={selectedChoice} onChange={(event) => choose(event.target.value)}>
            <option value={NEVER_CHOICE}>{translate("inactivityLock.never")}</option>
            {INACTIVITY_LOCK_PRESET_MINUTES.map((minutes) => <option key={minutes} value={String(minutes)}>{durationLabel(minutes)}</option>)}
            <option value={CUSTOM_CHOICE}>{translate("inactivityLock.custom")}</option>
          </select>
        )}
      </SettingRow>
      {choosesCustom && (
        // 数・単位・保存の 3 つを並べると、右に寄せる行（SettingRow）の欄の幅に収まらないので、名前の下に欄を置く縦の形にする。
        <div className="field inactivity-lock-amount">
          <label htmlFor="inactivity-lock-amount">{translate("inactivityLock.customAmount")}</label>
          <div className="field-row">
            <input id="inactivity-lock-amount" type="number" inputMode="numeric" aria-describedby="inactivity-lock-amount-hint" value={amountText}
              onChange={(event) => setAmountText(event.target.value)} onKeyDown={saveCustomOnEnter} />
            <select aria-label={translate("inactivityLock.unit")} value={unit} onChange={(event) => setUnit(event.target.value as InactivityLockUnit)} onKeyDown={saveCustomOnEnter}>
              {INACTIVITY_LOCK_UNITS.map((choice) => <option key={choice} value={choice}>{translate(UNIT_LABELS[choice])}</option>)}
            </select>
            <button type="button" className="secondary-button" disabled={typedMinutes === null || typedMinutes === inactivityLockMinutes} onClick={saveCustom}>
              {translate("common.save")}
            </button>
          </div>
          <span className="hint" id="inactivity-lock-amount-hint">
            {translate("inactivityLock.customAmountHint", { current: inactivityLockMinutes === null ? translate("inactivityLock.never") : durationLabel(inactivityLockMinutes) })}
          </span>
          {"invalid" in typed && <span className="form-error" role="alert">{translate(INVALID_MESSAGES[typed.invalid])}</span>}
        </div>
      )}
    </>
  );
}

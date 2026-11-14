// 設定: 操作したときに振動するか（Android のアプリだけに出す。このデバイスだけの設定）。

import { translate } from "../i18n/translate";
import { updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { SettingCheckboxRow } from "./SettingRow";

export function HapticFeedbackSection() {
  const { hapticFeedback } = useDevicePreferences();
  return (
    <section className="settings-section">
      <h2>{translate("settings.vibration")}</h2>
      <SettingCheckboxRow controlId="haptic-feedback" label={translate("settings.hapticFeedback")} hint={translate("settings.hapticFeedbackHint")}
        checked={hapticFeedback} onChange={(enabled) => updateDevicePreferences({ hapticFeedback: enabled })} />
    </section>
  );
}

// 設定: カスタム CSS（自分で書いた CSS で画面の見た目を変える）。このデバイスだけの設定。

import { useState } from "react";
import { translate } from "../i18n/translate";
import { updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { SettingCheckboxRow } from "./SettingRow";
import { useUnsavedSettingsDraft } from "./unsavedSettingsDrafts";

const CSS_EDITOR_ROWS = 8;

export function CustomCssSection() {
  const { customCss, customCssEnabled } = useDevicePreferences();
  const [draft, setDraft] = useState(customCss);
  useUnsavedSettingsDraft("customCss", draft !== customCss);
  return (
    <section className="settings-section">
      <h2>{translate("settings.customCss")}</h2>
      <p>{translate("settings.customCssDescription")}</p>
      <SettingCheckboxRow controlId="custom-css-enabled" label={translate("settings.customCssEnabled")} checked={customCssEnabled}
        onChange={(enabled) => updateDevicePreferences({ customCssEnabled: enabled })} />
      <textarea className="code-input" rows={CSS_EDITOR_ROWS} spellCheck={false} value={draft} aria-label={translate("settings.customCss")}
        placeholder=".ProseMirror { line-height: 2; }" onChange={(event) => setDraft(event.target.value)} />
      <div className="form-actions">
        <button type="button" className="secondary-button" disabled={draft === customCss} onClick={() => updateDevicePreferences({ customCss: draft })}>
          {translate("settings.customCssApply")}
        </button>
      </div>
    </section>
  );
}

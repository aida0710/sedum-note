// 設定: カスタム CSS（自分で書いた CSS で画面の見た目を変える）。このデバイスだけの設定。

import { useState } from "react";
import { translate } from "../i18n/translate";
import { updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";

const CSS_EDITOR_ROWS = 8;

export function CustomCssSection() {
  const { customCss, customCssEnabled } = useDevicePreferences();
  const [draft, setDraft] = useState(customCss);
  return (
    <section className="settings-section">
      <h2>{translate("settings.customCss")}</h2>
      <p>{translate("settings.customCssDescription")}</p>
      <label className="checkbox-line">
        <input type="checkbox" checked={customCssEnabled} onChange={(event) => updateDevicePreferences({ customCssEnabled: event.target.checked })} />
        {translate("settings.customCssEnabled")}
      </label>
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

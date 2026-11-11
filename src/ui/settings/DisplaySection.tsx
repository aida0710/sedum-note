// 設定: このデバイスの表示（言語）。

import { type Language } from "../i18n/languageInUse";
import { translate } from "../i18n/translate";
import { LANGUAGE_CHOICES, type LanguageChoice, updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";

// 言語の名前は、画面の言語に関わらずその言語で書く（読めない言語に変えても戻せるように）。
const LANGUAGE_NAMES: Record<Language, string> = { ja: "日本語", en: "English" };

export function DisplaySection() {
  const preferences = useDevicePreferences();
  return (
    <section className="settings-section">
      <h2>{translate("settings.display")}</h2>
      <div className="field">
        <label htmlFor="display-language">{translate("settings.language")}</label>
        <select
          id="display-language"
          value={preferences.language}
          onChange={(event) => updateDevicePreferences({ language: event.target.value as LanguageChoice })}
        >
          {LANGUAGE_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {choice === "system" ? translate("settings.language.system") : LANGUAGE_NAMES[choice]}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

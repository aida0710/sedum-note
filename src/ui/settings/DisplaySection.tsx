// 設定: このデバイスの表示（言語、メモの並び順）。

import { NOTE_SORT_ORDERS, type NoteSortOrder } from "../../core/notes/noteQueries";
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
      <div className="field">
        <label htmlFor="display-note-sort-order">{translate("settings.noteSortOrder")}</label>
        <select
          id="display-note-sort-order"
          value={preferences.noteSortOrder}
          onChange={(event) => updateDevicePreferences({ noteSortOrder: event.target.value as NoteSortOrder })}
        >
          {NOTE_SORT_ORDERS.map((order) => <option key={order} value={order}>{translate(`settings.noteSortOrder.${order}`)}</option>)}
        </select>
      </div>
    </section>
  );
}

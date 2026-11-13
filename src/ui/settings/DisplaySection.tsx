// 設定: このデバイスの表示（言語、メモの並び順、本文の文字の大きさ、本文の配置の既定、写真を貼るときの大きさ、タイプライターモード）。

import { NOTE_SORT_ORDERS, type NoteSortOrder } from "../../core/notes/noteQueries";
import { PAGE_ALIGNMENTS, type PageAlignment } from "../../core/notes/noteRecords";
import { REDUCED_IMAGE_MAX_EDGE } from "../editor/reduceImage";
import { type Language } from "../i18n/languageInUse";
import { translate } from "../i18n/translate";
import { EDITOR_FONT_SIZES, type EditorFontSize, IMAGE_ATTACHMENT_CHOICES, type ImageAttachmentChoice, LANGUAGE_CHOICES, type LanguageChoice, updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { SettingCheckboxRow, SettingRow } from "./SettingRow";

// 言語の名前は、画面の言語に関わらずその言語で書く（読めない言語に変えても戻せるように）。
const LANGUAGE_NAMES: Record<Language, string> = { ja: "日本語", en: "English" };

export function DisplaySection() {
  const preferences = useDevicePreferences();
  return (
    <section className="settings-section">
      <h2>{translate("settings.display")}</h2>
      <SettingRow controlId="display-language" label={translate("settings.language")}>
        {(control) => (
          <select {...control} value={preferences.language} onChange={(event) => updateDevicePreferences({ language: event.target.value as LanguageChoice })}>
            {LANGUAGE_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {choice === "system" ? translate("settings.language.system") : LANGUAGE_NAMES[choice]}
              </option>
            ))}
          </select>
        )}
      </SettingRow>
      <SettingRow controlId="display-note-sort-order" label={translate("settings.noteSortOrder")}>
        {(control) => (
          <select {...control} value={preferences.noteSortOrder} onChange={(event) => updateDevicePreferences({ noteSortOrder: event.target.value as NoteSortOrder })}>
            {NOTE_SORT_ORDERS.map((order) => <option key={order} value={order}>{translate(`settings.noteSortOrder.${order}`)}</option>)}
          </select>
        )}
      </SettingRow>
      <SettingRow controlId="display-editor-font-size" label={translate("settings.editorFontSize")}>
        {(control) => (
          <select {...control} value={preferences.editorFontSize} onChange={(event) => updateDevicePreferences({ editorFontSize: event.target.value as EditorFontSize })}>
            {EDITOR_FONT_SIZES.map((size) => <option key={size} value={size}>{translate(`settings.editorFontSize.${size}`)}</option>)}
          </select>
        )}
      </SettingRow>
      <SettingRow controlId="display-page-alignment" label={translate("settings.pageAlignment")} hint={translate("settings.pageAlignmentHint")}>
        {(control) => (
          <select {...control} value={preferences.pageAlignment} onChange={(event) => updateDevicePreferences({ pageAlignment: event.target.value as PageAlignment })}>
            {PAGE_ALIGNMENTS.map((alignment) => <option key={alignment} value={alignment}>{translate(`pageAlignment.${alignment}`)}</option>)}
          </select>
        )}
      </SettingRow>
      <SettingRow controlId="display-image-attachment" label={translate("settings.imageAttachment")}
        hint={translate("settings.imageAttachmentHint", { edge: REDUCED_IMAGE_MAX_EDGE })}>
        {(control) => (
          <select {...control} value={preferences.imageAttachment} onChange={(event) => updateDevicePreferences({ imageAttachment: event.target.value as ImageAttachmentChoice })}>
            {IMAGE_ATTACHMENT_CHOICES.map((choice) => <option key={choice} value={choice}>{translate(`settings.imageAttachment.${choice}`)}</option>)}
          </select>
        )}
      </SettingRow>
      <SettingCheckboxRow controlId="display-typewriter-mode" label={translate("settings.typewriterMode")} checked={preferences.typewriterMode}
        onChange={(typewriterMode) => updateDevicePreferences({ typewriterMode })} />
    </section>
  );
}

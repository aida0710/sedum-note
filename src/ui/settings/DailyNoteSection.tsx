// 設定: デイリーノート（その日のメモ）の題の形式と、新しく作るときに入れるノートブック。このデバイスだけの設定。
// 題の形式は、テンプレートの変数（@date など）の形式にも使う（editor/templateTimeValues.ts）。

import type { LiveNotebook } from "../../core/notes/noteRecords";
import { languageInUse } from "../i18n/languageInUse";
import { translate } from "../i18n/translate";
import { updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { DAILY_NOTE_TITLE_FORMATS, type DailyNoteTitleFormat, dailyNoteTitle } from "../workspace/dailyNote";
import { SettingRow } from "./SettingRow";

const NO_NOTEBOOK = "";

export function DailyNoteSection({ notebooks }: { notebooks: LiveNotebook[] }) {
  const { dailyNoteTitleFormat, dailyNoteNotebookId } = useDevicePreferences();
  const today = new Date();
  return (
    <section className="settings-section">
      <h2>{translate("settings.dailyNote")}</h2>
      <p>{translate("settings.dailyNoteDescription")}</p>
      <SettingRow controlId="daily-note-title-format" label={translate("settings.dailyNoteTitleFormat")} hint={translate("settings.dailyNoteTitleFormatHint")}>
        {(control) => (
          <select {...control} value={dailyNoteTitleFormat}
            onChange={(event) => updateDevicePreferences({ dailyNoteTitleFormat: event.target.value as DailyNoteTitleFormat })}>
            {DAILY_NOTE_TITLE_FORMATS.map((format) => <option key={format} value={format}>{dailyNoteTitle(format, today, languageInUse())}</option>)}
          </select>
        )}
      </SettingRow>
      <SettingRow controlId="daily-note-notebook" label={translate("settings.dailyNoteNotebook")}>
        {(control) => (
          <select {...control} value={notebooks.some((notebook) => notebook.id === dailyNoteNotebookId) ? dailyNoteNotebookId ?? NO_NOTEBOOK : NO_NOTEBOOK}
            onChange={(event) => updateDevicePreferences({ dailyNoteNotebookId: event.target.value === NO_NOTEBOOK ? null : event.target.value })}>
            <option value={NO_NOTEBOOK}>{translate("settings.dailyNoteNoNotebook")}</option>
            {notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.content.name}</option>)}
          </select>
        )}
      </SettingRow>
    </section>
  );
}

// 設定: デイリーノート（その日のメモ）の題の形式と、新しく作るときに入れるノートブック。このデバイスだけの設定。

import type { LiveNotebook } from "../../core/notes/noteRecords";
import { languageInUse } from "../i18n/languageInUse";
import { translate } from "../i18n/translate";
import { updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { DAILY_NOTE_TITLE_FORMATS, type DailyNoteTitleFormat, dailyNoteTitle } from "../workspace/dailyNote";

const NO_NOTEBOOK = "";

export function DailyNoteSection({ notebooks }: { notebooks: LiveNotebook[] }) {
  const { dailyNoteTitleFormat, dailyNoteNotebookId } = useDevicePreferences();
  const today = new Date();
  return (
    <section className="settings-section">
      <h2>{translate("settings.dailyNote")}</h2>
      <p>{translate("settings.dailyNoteDescription")}</p>
      <div className="field">
        <label htmlFor="daily-note-title-format">{translate("settings.dailyNoteTitleFormat")}</label>
        <select id="daily-note-title-format" value={dailyNoteTitleFormat}
          onChange={(event) => updateDevicePreferences({ dailyNoteTitleFormat: event.target.value as DailyNoteTitleFormat })}>
          {DAILY_NOTE_TITLE_FORMATS.map((format) => <option key={format} value={format}>{dailyNoteTitle(format, today, languageInUse())}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="daily-note-notebook">{translate("settings.dailyNoteNotebook")}</label>
        <select id="daily-note-notebook" value={notebooks.some((notebook) => notebook.id === dailyNoteNotebookId) ? dailyNoteNotebookId ?? NO_NOTEBOOK : NO_NOTEBOOK}
          onChange={(event) => updateDevicePreferences({ dailyNoteNotebookId: event.target.value === NO_NOTEBOOK ? null : event.target.value })}>
          <option value={NO_NOTEBOOK}>{translate("settings.dailyNoteNoNotebook")}</option>
          {notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.content.name}</option>)}
        </select>
      </div>
    </section>
  );
}

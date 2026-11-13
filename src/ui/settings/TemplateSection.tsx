// 設定: テンプレートの変数（@date・@time・@datetime）に入れる日付と時刻の形式。このデバイスだけの設定。

import { TEMPLATE_DATE_FORMATS, type TemplateDateFormat, templateTimeValues } from "../editor/templateTimeValues";
import { languageInUse } from "../i18n/languageInUse";
import { translate } from "../i18n/translate";
import { updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { SettingRow } from "./SettingRow";

export function TemplateSection() {
  const { templateDateFormat } = useDevicePreferences();
  const now = new Date();
  return (
    <section className="settings-section">
      <h2>{translate("settings.templates")}</h2>
      <SettingRow controlId="template-date-format" label={translate("settings.templateDateFormat")} hint={translate("settings.templateDateFormatHint")}>
        {(control) => (
          <select {...control} value={templateDateFormat}
            onChange={(event) => updateDevicePreferences({ templateDateFormat: event.target.value as TemplateDateFormat })}>
            {/* 選ぶ欄には、今の日時をその形式で書いたものを見本として出す。 */}
            {TEMPLATE_DATE_FORMATS.map((format) => (
              <option key={format} value={format}>{templateTimeValues({ now, language: languageInUse(), dateFormat: format }).datetime}</option>
            ))}
          </select>
        )}
      </SettingRow>
    </section>
  );
}

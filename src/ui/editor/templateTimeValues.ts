// テンプレートの変数（@date・@time・@datetime）に入れる、日付と時刻の文字。
//
// 形式は、デイリーノートの題の形式の設定に合わせる。テンプレートで「@date の日報」のような題を作ったときに、
// デイリーノートと同じ書き方の日付になるように。long は「日付の挿入」（「/」とショートカット）と同じ書き方。

import type { TemplateTimeValues } from "../../core/notes/templateVariables";
import { languageInUse } from "../i18n/languageInUse";
import { readDevicePreferences } from "../preferences/devicePreferences";
import { formatIsoDate, formatIsoTime, formatLongDate, formatLongDateTime, formatShortTime } from "../shared/formatTime";
import type { DailyNoteTitleFormat } from "../workspace/dailyNote";

type TemplateTimeInput = { now: Date; language: string; dateFormat: DailyNoteTitleFormat };

export function templateTimeValues({ now, language, dateFormat }: TemplateTimeInput): TemplateTimeValues {
  if (dateFormat === "long") {
    return { date: formatLongDate(now, language), time: formatShortTime(now, language), datetime: formatLongDateTime(now, language) };
  }
  return { date: formatIsoDate(now), time: formatIsoTime(now), datetime: `${formatIsoDate(now)} ${formatIsoTime(now)}` };
}

// 今の日時を、このデバイスの設定（画面の言語と、デイリーノートの題の形式）で文字にする。
export function currentTemplateTimeValues(): TemplateTimeValues {
  return templateTimeValues({ now: new Date(), language: languageInUse(), dateFormat: readDevicePreferences().dailyNoteTitleFormat });
}

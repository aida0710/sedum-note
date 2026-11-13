// テンプレートの変数（@date・@time・@datetime）に入れる、日付と時刻の文字。
//
// 形式は、設定の「一般」の「テンプレート」で選ぶ（このデバイスだけの設定）。iso は 2026-11-12 と 14:05（並べ替えても
// 日付の順になる）、long は画面の言語の書き方（2026年11月12日）で、「日付の挿入」（「/」とショートカット）と同じ書き方。

import type { TemplateTimeValues } from "../../core/notes/templateVariables";
import { languageInUse } from "../i18n/languageInUse";
import { readDevicePreferences } from "../preferences/devicePreferences";
import { formatIsoDate, formatIsoTime, formatLongDate, formatLongDateTime, formatShortTime } from "../shared/formatTime";
export const TEMPLATE_DATE_FORMATS = ["iso", "long"] as const;
export type TemplateDateFormat = (typeof TEMPLATE_DATE_FORMATS)[number];

type TemplateTimeInput = { now: Date; language: string; dateFormat: TemplateDateFormat };

export function templateTimeValues({ now, language, dateFormat }: TemplateTimeInput): TemplateTimeValues {
  if (dateFormat === "long") {
    return { date: formatLongDate(now, language), time: formatShortTime(now, language), datetime: formatLongDateTime(now, language) };
  }
  return { date: formatIsoDate(now), time: formatIsoTime(now), datetime: `${formatIsoDate(now)} ${formatIsoTime(now)}` };
}

// 今の日時を、このデバイスの設定（画面の言語と、テンプレートの日付と時刻の形式）で文字にする。
export function currentTemplateTimeValues(): TemplateTimeValues {
  return templateTimeValues({ now: new Date(), language: languageInUse(), dateFormat: readDevicePreferences().templateDateFormat });
}

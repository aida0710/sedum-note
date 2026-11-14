// 日時を文字にする。画面に出す日時は、いまの画面の言語に合わせる。本文や題に書き込む日時は、言語を引数で受ける。

import { dueTimeAsDate } from "../../core/notes/dueTimes";
import { languageInUse } from "../i18n/languageInUse";

// 画面に出す日時の書き方。Intl.DateTimeFormat は作るのが重い（1 つ 0.2ms ほど）ので、言語ごとに 1 つ作って使い回す。
// スマホの一覧はメモの行ごとに日付を書くので、作り直すと、メモが 2,000 件あると一覧を出すたびに 0.4 秒ほどかかる。
const SHORT_DATE_FORMAT: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" };
const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" };
const formattersByLanguage = new Map<string, { shortDate: Intl.DateTimeFormat; dateTime: Intl.DateTimeFormat }>();

function formattersInUse(): { shortDate: Intl.DateTimeFormat; dateTime: Intl.DateTimeFormat } {
  const language = languageInUse();
  let formatters = formattersByLanguage.get(language);
  if (!formatters) {
    formatters = { shortDate: new Intl.DateTimeFormat(language, SHORT_DATE_FORMAT), dateTime: new Intl.DateTimeFormat(language, DATE_TIME_FORMAT) };
    formattersByLanguage.set(language, formatters);
  }
  return formatters;
}

export function formatShortDate(iso: string): string {
  return formattersInUse().shortDate.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return formattersInUse().dateTime.format(new Date(iso));
}

// 期限（core/notes/dueTimes.ts の形）を、画面に出す日時にする。
export function formatDueTime(dueAt: string): string {
  const date = dueTimeAsDate(dueAt);
  return date ? formatDateTime(date.toISOString()) : dueAt;
}

// ── 本文や題に文字で書き込む日時（日付の挿入、テンプレートの変数） ─────────────
// 言語は引数で受ける。書き込んだ文字は後から言語を変えても変わらないので、どの言語で書いたかを呼び出し側が決める。

// 年まで入った、その言語の書き方（2026年11月12日、November 12, 2026）。
export function formatLongDate(date: Date, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "long" }).format(date);
}

// formatLongDate に時と分を付けたもの（2026年11月12日 14:05、November 12, 2026 at 2:05 PM）。
export function formatLongDateTime(date: Date, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "long", timeStyle: "short" }).format(date);
}

// その言語の書き方の、時と分（14:05、2:05 PM）。
export function formatShortTime(date: Date, language: string): string {
  return new Intl.DateTimeFormat(language, { timeStyle: "short" }).format(date);
}

// 数字だけの日付（2026-11-12）。並べ替えても日付の順になる。デバイスのタイムゾーンの日付にする。
export function formatIsoDate(date: Date): string {
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

// 数字だけの、24 時間の時と分（14:05）。
export function formatIsoTime(date: Date): string {
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

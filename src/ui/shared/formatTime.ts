// 日時を文字にする。画面に出す日時（画面の言語に合わせる）と、本文や題に文字で書き込む日時。

import { dueTimeAsDate } from "../../core/notes/dueTimes";
import { languageInUse } from "../i18n/languageInUse";

export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat(languageInUse(), { month: "long", day: "numeric" }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(languageInUse(), { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso));
}

// 期限（core/notes/dueTimes.ts の形）を、画面に出す日時にする。
export function formatDueTime(dueAt: string): string {
  const date = dueTimeAsDate(dueAt);
  return date ? formatDateTime(date.toISOString()) : dueAt;
}

// ── 本文や題に文字で書き込む日時（日付の挿入、デイリーノート、テンプレートの変数） ─────────────
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

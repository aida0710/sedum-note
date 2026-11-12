// 画面に出す日時の形。画面の言語に合わせる。

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

// 期限の通知について、このデバイスに残したもの（もう知らせた期限の名前と、Android で OS に予約した通知）。
// 知らせた期限の名前（DueItem.key。「メモの ID|期限|項目の ID」）は、メモの中身を含まない。全部のスペースの分を、まとめて持つ。

import { MISSED_REMINDER_WINDOW_MILLISECONDS } from "../../core/notes/dueItems";
import { dueTimeAsDate } from "../../core/notes/dueTimes";
import { canScheduleNotifications, replaceScheduledNotifications } from "../platform/systemNotifications";

const NOTIFIED_KEYS_STORAGE_KEY = "sedum-note:notifiedDueKeys";

export function readNotifiedDueKeys(): Set<string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(NOTIFIED_KEYS_STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(stored) ? stored.filter((key) => typeof key === "string") : []);
  } catch {
    return new Set();
  }
}

// 知らせた期限の名前を足して書く。期限から 2 日より前のものは捨てる（1 日より前に過ぎた期限は、もう知らせないので、覚えておく必要が無い）。
// 開いているスペースに今ある期限かどうかでは捨てない（ほかのスペースで知らせた分を、忘れないように）。
export function addNotifiedDueKeys(keys: string[], now: Date): void {
  const oldestKeptTime = now.getTime() - 2 * MISSED_REMINDER_WINDOW_MILLISECONDS;
  const isRecent = (key: string) => (dueTimeAsDate(key.split("|")[1] ?? "")?.getTime() ?? 0) >= oldestKeptTime;
  localStorage.setItem(NOTIFIED_KEYS_STORAGE_KEY, JSON.stringify([...readNotifiedDueKeys(), ...keys].filter(isRecent)));
}

// 「このデバイスのデータを消す」で使う。OS に予約した通知には、項目の文字とメモの題が入っているので、取り消す。
export async function clearDueReminderRecords(): Promise<void> {
  localStorage.removeItem(NOTIFIED_KEYS_STORAGE_KEY);
  if (canScheduleNotifications()) {
    await replaceScheduledNotifications([]);
  }
}

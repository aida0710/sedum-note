// 期限の通知について、このデバイスに残したもの（もう知らせた期限の名前と、Android で OS に予約した通知）。
// 知らせた期限の名前（DueItem.key）は、メモの ID・期限・順番だけでできていて、メモの中身を含まない。

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

export function writeNotifiedDueKeys(keys: string[]): void {
  localStorage.setItem(NOTIFIED_KEYS_STORAGE_KEY, JSON.stringify(keys));
}

// 「このデバイスのデータを消す」で使う。OS に予約した通知には、項目の文字とメモの題が入っているので、取り消す。
export async function clearDueReminderRecords(): Promise<void> {
  localStorage.removeItem(NOTIFIED_KEYS_STORAGE_KEY);
  if (canScheduleNotifications()) {
    await replaceScheduledNotifications([]);
  }
}

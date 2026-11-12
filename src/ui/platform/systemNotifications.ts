// OS の通知。アプリ（Tauri）の中では通知のプラグインを、ブラウザ（Web 版）では Notification API を使う。
// Android のアプリでは、日時を指定して OS に予約できる（アプリが動いていなくても、その時刻に出る）。

import { isAndroidApp, isRunningInTauri } from "./runtime";

export type SystemNotification = {
  // 予約を取り消すときに使う番号（32 ビットの整数）。
  id: number;
  title: string;
  body: string;
};

export type ScheduledNotification = SystemNotification & { at: Date };

// 通知を出してよいと、利用者が OS（かブラウザ）に許しているか。
export async function isNotificationPermitted(): Promise<boolean> {
  if (isRunningInTauri()) {
    return (await import("@tauri-apps/plugin-notification")).isPermissionGranted();
  }
  return "Notification" in window && Notification.permission === "granted";
}

// 通知の許可を求める（押した操作の中から呼ぶ）。許されたら true。
export async function requestNotificationPermission(): Promise<boolean> {
  if (isRunningInTauri()) {
    const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
    return (await isPermissionGranted()) || (await requestPermission()) === "granted";
  }
  return "Notification" in window && (await Notification.requestPermission()) === "granted";
}

export async function showNotification({ id, title, body }: SystemNotification): Promise<void> {
  if (isRunningInTauri()) {
    (await import("@tauri-apps/plugin-notification")).sendNotification({ id, title, body });
    return;
  }
  new Notification(title, { body, tag: String(id) });
}

// 日時を指定した通知を、OS に予約できるか（Android のアプリだけ）。
export function canScheduleNotifications(): boolean {
  return isAndroidApp();
}

// OS に予約してある通知を、渡したものに入れ替える。
export async function replaceScheduledNotifications(notifications: ScheduledNotification[]): Promise<void> {
  const { cancelAll, Schedule, sendNotification } = await import("@tauri-apps/plugin-notification");
  await cancelAll();
  for (const { id, title, body, at } of notifications) {
    // 本文は largeBody にも入れる。Android のプラグインは、largeBody が無いと行の一覧（空）の形にするので、
    // 通知を広げたときに本文が出ない。Schedule.at の 3 つ目の引数は、端末が省電力で休んでいる間も出すかどうか。
    sendNotification({ id, title, body, largeBody: body, schedule: Schedule.at(at, false, true) });
  }
}

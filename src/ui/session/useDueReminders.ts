// 期限が来たことを、OS の通知で知らせる。設定（期限の通知）を入れている間だけ動く。
//   PC のアプリとブラウザ  開いていてロックを解除している間、期限が来たら出す（見直しは 30 秒おき）。閉じていた間に過ぎた期限は、
//                         次に開いたときに出す
//   Android のアプリ       これから来る期限を OS に予約する。アプリが動いていなくても、その時刻に出る

import { useEffect, useMemo, useRef } from "react";
import { type DueItem, dueItemsOf, dueItemsToNotify, upcomingDueItems } from "../../core/notes/dueItems";
import { dueTimeAsDate } from "../../core/notes/dueTimes";
import type { NoteSummary } from "../../core/notes/noteQueries";
import { translate } from "../i18n/translate";
import { canScheduleNotifications, replaceScheduledNotifications, showNotification, type SystemNotification } from "../platform/systemNotifications";
import { addNotifiedDueKeys, readNotifiedDueKeys } from "./dueReminderRecords";
import { useDevicePreferences } from "../preferences/devicePreferences";
import { formatDueTime } from "../shared/formatTime";

// 期限が来たかを見直す間隔。期限は分の単位なので、1 分より細かく見る。
const DUE_CHECK_INTERVAL_MILLISECONDS = 30_000;
// OS に予約する通知の数の上限（期限の近い順）。Android が 1 つのアプリに許す予約の数（500）に、余裕を持って収める。
const MAX_SCHEDULED_NOTIFICATIONS = 100;
// 通知の番号。期限の名前から決めるので、同じ期限は、予約し直しても同じ番号になる。
function notificationId(key: string): number {
  let hash = 0;
  for (const character of key) {
    hash = (hash * 31 + character.codePointAt(0)!) | 0;
  }
  return Math.abs(hash);
}

function notificationOf(item: DueItem): SystemNotification {
  const noteTitle = item.noteTitle || translate("sidebar.untitled");
  const time = formatDueTime(item.dueAt);
  return { id: notificationId(item.key), title: item.task?.text || noteTitle, body: translate("due.notificationBody", { time, title: noteTitle }) };
}

type DueRemindersInput = {
  // このウィンドウが通知を受け持つか。メモを 1 つだけ開く別のウィンドウでは false（同じ通知を 2 つ出さない）。
  enabled: boolean;
  summaries: NoteSummary[];
};

export function useDueReminders({ enabled, summaries }: DueRemindersInput): void {
  const dueNotifications = useDevicePreferences().dueNotifications && enabled;
  const items = useMemo(() => dueItemsOf(summaries), [summaries]);

  // 開いている間に来た期限を出す。期限は、決めた間隔で見直す。前の見直しのときにも同じ形であった期限だけを知らせる
  // （期限の印を打っている途中の、時刻をまだ打っていない日付で、通知を出さないため）。
  const latestItems = useRef(items);
  latestItems.current = items;
  useEffect(() => {
    if (!dueNotifications || canScheduleNotifications()) {
      return undefined;
    }
    let keysAtPreviousCheck = new Set<string>();
    const notifyDueItems = () => {
      const currentItems = latestItems.current;
      const notifiedKeys = readNotifiedDueKeys();
      const dueItems = dueItemsToNotify(currentItems, { now: new Date(), notifiedKeys }).filter((item) => keysAtPreviousCheck.has(item.key));
      const currentKeys = new Set(currentItems.map((item) => item.key));
      keysAtPreviousCheck = currentKeys;
      if (dueItems.length === 0) {
        return;
      }
      // 出せなかった通知は、知らせたことにしない（次の見直しでまた試す）。
      const shownKeys = dueItems.filter((item) => {
        try {
          showNotification(notificationOf(item));
          return true;
        } catch {
          return false;
        }
      }).map((item) => item.key);
      addNotifiedDueKeys(shownKeys, new Date());
    };
    notifyDueItems();
    const timer = setInterval(notifyDueItems, DUE_CHECK_INTERVAL_MILLISECONDS);
    return () => clearInterval(timer);
  }, [dueNotifications]);

  // Android では、これから来る期限を OS に予約し直す。予約の中身が前と同じなら、何もしない。
  const lastScheduled = useRef<string | null>(null);
  useEffect(() => {
    if (!canScheduleNotifications() || !enabled) {
      return;
    }
    const scheduled = dueNotifications
      ? upcomingDueItems(items, new Date()).slice(0, MAX_SCHEDULED_NOTIFICATIONS)
        .map((item) => ({ ...notificationOf(item), at: dueTimeAsDate(item.dueAt)! }))
      : [];
    const serialized = JSON.stringify(scheduled);
    if (serialized !== lastScheduled.current) {
      lastScheduled.current = serialized;
      void replaceScheduledNotifications(scheduled);
    }
  }, [enabled, dueNotifications, items]);
}

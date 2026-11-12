// 期限のあるもの（メモの期限と、期限の印が付いたチェックリストの項目）を集めた一覧と、知らせる時期の決まり。

import { dueTimeAsDate } from "./dueTimes";
import type { DueTask } from "./dueTasks";
import type { NoteSummary } from "./noteQueries";

export type DueItem = {
  // 同じ期限を 2 回知らせないための名前（メモの ID、期限、項目ならその項目の ID）。期限を変えると、別のものとして知らせ直す。
  // 知らせた名前は、暗号化しない場所に覚えておくので、項目の文字やメモの題を入れない。
  key: string;
  noteId: string;
  noteTitle: string;
  dueAt: string;
  done: boolean;
  // メモの期限なら null。チェックリストの項目なら、その項目。
  task: DueTask | null;
};

// 過ぎた期限を、あとからでも知らせる長さ。アプリを閉じていた間に過ぎた期限を、開いたときに知らせる。
// これより前に過ぎたものは、一覧に「期限切れ」として出すだけにする（古い期限をまとめて知らせない）。
export const MISSED_REMINDER_WINDOW_MILLISECONDS = 24 * 60 * 60 * 1000;

// 期限の早い順。ゴミ箱のメモとテンプレートは除く。メモの期限は、付けている間は完了にならない。
export function dueItemsOf(summaries: NoteSummary[]): DueItem[] {
  const items: DueItem[] = [];
  for (const { note, dueTasks } of summaries) {
    const { title, trashedAt, isTemplate, dueAt } = note.content;
    if (trashedAt !== null || isTemplate) {
      continue;
    }
    if (dueAt !== null) {
      items.push({ key: `${note.id}|${dueAt}`, noteId: note.id, noteTitle: title, dueAt, done: false, task: null });
    }
    for (const task of dueTasks) {
      items.push({ key: `${note.id}|${task.dueAt}|${task.itemKey}`, noteId: note.id, noteTitle: title, dueAt: task.dueAt, done: task.done, task });
    }
  }
  return items.sort((left, right) => left.dueAt.localeCompare(right.dueAt));
}

// 期限が来ていて、まだ知らせていないもの。
export function dueItemsToNotify(items: DueItem[], { now, notifiedKeys }: { now: Date; notifiedKeys: ReadonlySet<string> }): DueItem[] {
  return items.filter((item) => {
    const dueTime = dueTimeAsDate(item.dueAt)?.getTime();
    return dueTime !== undefined && !item.done && !notifiedKeys.has(item.key) && dueTime <= now.getTime() && now.getTime() - dueTime <= MISSED_REMINDER_WINDOW_MILLISECONDS;
  });
}

// これから期限が来るもの（OS に予約する通知の元）。
export function upcomingDueItems(items: DueItem[], now: Date): DueItem[] {
  return items.filter((item) => !item.done && (dueTimeAsDate(item.dueAt)?.getTime() ?? 0) > now.getTime());
}

// 期限の一覧の区切り。overdue は過ぎたもの、today は今日これから来るもの、upcoming は明日より先、done は済んだもの。
export const DUE_GROUPS = ["overdue", "today", "upcoming", "done"] as const;
export type DueGroup = (typeof DUE_GROUPS)[number];

export function groupDueItems(items: DueItem[], now: Date): Record<DueGroup, DueItem[]> {
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const groups: Record<DueGroup, DueItem[]> = { overdue: [], today: [], upcoming: [], done: [] };
  for (const item of items) {
    const dueTime = dueTimeAsDate(item.dueAt)?.getTime() ?? 0;
    const group: DueGroup = item.done ? "done" : dueTime <= now.getTime() ? "overdue" : dueTime < endOfToday ? "today" : "upcoming";
    groups[group].push(item);
  }
  return groups;
}

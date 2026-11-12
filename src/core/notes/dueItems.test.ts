import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { appendParagraph, appendTaskItem } from "./bodyFixtures";
import { dueItemsOf, dueItemsToNotify, groupDueItems, MISSED_REMINDER_WINDOW_MILLISECONDS, upcomingDueItems } from "./dueItems";
import { bodyDueTasks, setDueTaskDone } from "./dueTasks";
import { dueMarkText, dueTimeAsDate, dueTimeOf, findDueMark, isDueTime } from "./dueTimes";
import { noteContentFixture } from "./noteFixtures";
import { summarizeNote } from "./noteQueries";
import type { LiveNote } from "./noteRecords";

const CREATED_AT = "2026-01-01T00:00:00.000Z";

function note(id: string, overrides: Partial<LiveNote["content"]> = {}): LiveNote {
  const body = new Y.Doc().getXmlFragment("body");
  return { id, kind: "note", updatedAt: CREATED_AT, revision: 1, body, content: noteContentFixture({ createdAt: CREATED_AT, title: id, ...overrides }) };
}

describe("期限の時刻", () => {
  it("文字の中の期限の印を読む。時刻を省くと朝 9 時になる", () => {
    expect(findDueMark("牛乳を買う 📅 2026-11-15 18:30")).toEqual({ dueAt: "2026-11-15T18:30", start: 6, end: 25 });
    expect(findDueMark("📅2026-11-15 提出")?.dueAt).toBe("2026-11-15T09:00");
    expect(findDueMark("📅 2026-11-15T7:05")?.dueAt).toBe("2026-11-15T07:05");
    // エディタで打った、改行しない空白でも読む。
    expect(findDueMark("📅 2026-11-15\u00a018:30")?.dueAt).toBe("2026-11-15T18:30");
    expect(findDueMark("期限なし")).toBeNull();
  });

  it("実在しない日時は、期限として読まない", () => {
    expect(findDueMark("📅 2026-02-31")).toBeNull();
    expect(isDueTime("2026-11-15T25:00")).toBe(false);
    expect(isDueTime("2026-11-15")).toBe(false);
  });

  it("期限は、デバイスの時計の日時として往復する", () => {
    const date = dueTimeAsDate("2026-11-15T09:00")!;
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([2026, 10, 15, 9, 0]);
    expect(dueTimeOf(date)).toBe("2026-11-15T09:00");
    expect(dueMarkText("2026-11-15T09:00")).toBe("📅 2026-11-15 09:00");
  });
});

describe("期限付きのチェックリストの項目", () => {
  it("期限の印が付いた項目だけを読み、文字からは印を除く", () => {
    const { body } = note("買い物");
    appendTaskItem(body, "牛乳を買う 📅 2026-11-15 18:30");
    appendTaskItem(body, "期限の無い項目");
    appendTaskItem(body, "📅 2026-11-16 提出する", true);
    appendParagraph(body, "ただの段落 📅 2026-11-17");
    expect(bodyDueTasks(body)).toMatchObject([
      { taskIndex: 0, text: "牛乳を買う", dueAt: "2026-11-15T18:30", done: false },
      { taskIndex: 2, text: "提出する", dueAt: "2026-11-16T09:00", done: true },
    ]);
  });

  it("項目を見分ける名前は、上に項目を足しても、文字を書き換えても変わらず、文字を含まない", () => {
    const { body } = note("買い物");
    appendTaskItem(body, "牛乳を買う 📅 2026-11-15 18:30");
    const [before] = bodyDueTasks(body);
    const added = new Y.XmlElement("paragraph");
    added.insert(0, [new Y.XmlText("上に足した行")]);
    body.insert(0, [added]);
    const [after] = bodyDueTasks(body);
    expect(after!.itemKey).toBe(before!.itemKey);
    expect(before!.itemKey).not.toContain("牛乳");
  });

  it("一覧から完了にできる。本文が変わって別の項目になっていたら、何もしない", () => {
    const { body } = note("買い物");
    appendTaskItem(body, "牛乳を買う 📅 2026-11-15 18:30");
    const [task] = bodyDueTasks(body);
    expect(setDueTaskDone(body, { ...task!, text: "別の文字" }, true)).toBe(false);
    expect(bodyDueTasks(body)[0]!.done).toBe(false);
    expect(setDueTaskDone(body, task!, true)).toBe(true);
    expect(bodyDueTasks(body)[0]!.done).toBe(true);
  });
});

describe("期限の一覧と通知", () => {
  const summaries = () => {
    const shopping = note("買い物");
    appendTaskItem(shopping.body, "牛乳を買う 📅 2026-11-15 18:30");
    appendTaskItem(shopping.body, "済んだもの 📅 2026-11-15 08:00", true);
    return [shopping, note("提出物", { dueAt: "2026-11-15T09:00" }), note("ゴミ箱", { dueAt: "2026-11-15T09:00", trashedAt: CREATED_AT })].map(summarizeNote);
  };

  it("メモの期限と項目の期限を、期限の早い順に並べる。ゴミ箱のメモは入れない", () => {
    expect(dueItemsOf(summaries()).map((item) => [item.noteTitle, item.task?.text ?? null, item.dueAt, item.done])).toEqual([
      ["買い物", "済んだもの", "2026-11-15T08:00", true],
      ["提出物", null, "2026-11-15T09:00", false],
      ["買い物", "牛乳を買う", "2026-11-15T18:30", false],
    ]);
  });

  it("期限が来た、済んでいないものを 1 回だけ知らせる。1 日より前に過ぎたものは知らせない", () => {
    const items = dueItemsOf(summaries());
    const at = (dueAt: string) => dueTimeAsDate(dueAt)!;
    expect(dueItemsToNotify(items, { now: at("2026-11-15T08:59"), notifiedKeys: new Set() })).toEqual([]);
    const due = dueItemsToNotify(items, { now: at("2026-11-15T09:00"), notifiedKeys: new Set() });
    expect(due.map((item) => item.noteTitle)).toEqual(["提出物"]);
    expect(dueItemsToNotify(items, { now: at("2026-11-15T09:01"), notifiedKeys: new Set(due.map((item) => item.key)) })).toEqual([]);
    const longAfter = new Date(at("2026-11-15T18:30").getTime() + MISSED_REMINDER_WINDOW_MILLISECONDS + 60_000);
    expect(dueItemsToNotify(items, { now: longAfter, notifiedKeys: new Set() })).toEqual([]);
    expect(upcomingDueItems(items, at("2026-11-15T09:00")).map((item) => item.task?.text)).toEqual(["牛乳を買う"]);
  });

  it("一覧を、期限切れ・今日・これから・完了に分ける", () => {
    const groups = groupDueItems(dueItemsOf(summaries()), dueTimeAsDate("2026-11-15T12:00")!);
    expect(groups.overdue.map((item) => item.noteTitle)).toEqual(["提出物"]);
    expect(groups.today.map((item) => item.task?.text)).toEqual(["牛乳を買う"]);
    expect(groups.upcoming).toEqual([]);
    expect(groups.done.map((item) => item.task?.text)).toEqual(["済んだもの"]);
    expect(groupDueItems(dueItemsOf(summaries()), dueTimeAsDate("2026-11-14T12:00")!).upcoming).toHaveLength(2);
  });
});

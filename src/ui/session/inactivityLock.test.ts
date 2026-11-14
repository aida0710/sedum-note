import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVITY_RECORD_INTERVAL_MS, InactivityLock, isInactivityLockDue } from "./inactivityLock";

const MINUTE = 60_000;
const TIMEOUT_MS = 15 * MINUTE;

// 全部のウィンドウで共有する最後の操作の時刻（localStorage を模す）と、そこを使うウィンドウ。
function sharedActivityRecord() {
  let lastActivityTime: number | null = null;
  const writes: number[] = [];
  const openWindow = () => {
    const lock = vi.fn();
    const inactivityLock = new InactivityLock({
      timeoutMs: TIMEOUT_MS,
      now: () => Date.now(),
      readLastActivityTime: () => lastActivityTime,
      writeLastActivityTime: (time) => {
        lastActivityTime = time;
        writes.push(time);
      },
      lock,
    });
    inactivityLock.start();
    return { inactivityLock, lock };
  };
  return { openWindow, writes };
}

describe("操作が無いときの自動のロック", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-11-14T09:00:00+09:00") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("最後の操作から決めた時間が過ぎたかは、ちょうどその時間からロックの側に数える", () => {
    expect(isInactivityLockDue({ lastActivityTime: 0, now: TIMEOUT_MS - 1, timeoutMs: TIMEOUT_MS })).toBe(false);
    expect(isInactivityLockDue({ lastActivityTime: 0, now: TIMEOUT_MS, timeoutMs: TIMEOUT_MS })).toBe(true);
  });

  it("操作が無いまま 15 分たつとロックする。その直前ではロックしない", () => {
    const { lock } = sharedActivityRecord().openWindow();
    vi.advanceTimersByTime(TIMEOUT_MS - 1);
    expect(lock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("操作は間引いて書く。続けて操作しても、5 秒に 1 回だけ共有の時刻を書く", () => {
    const record = sharedActivityRecord();
    const { inactivityLock } = record.openWindow();
    for (let second = 1; second <= 12; second += 1) {
      vi.advanceTimersByTime(1_000);
      inactivityLock.noteActivity();
    }
    // 開いたときの 1 回と、5 秒後・10 秒後の 2 回。
    expect(record.writes.map((time) => time - record.writes[0]!)).toEqual([0, ACTIVITY_RECORD_INTERVAL_MS, 2 * ACTIVITY_RECORD_INTERVAL_MS]);
  });

  it("ほかのウィンドウで操作すると、時間が延びる。そのウィンドウの操作も止まると、そこから決めた時間でロックする", () => {
    const record = sharedActivityRecord();
    const idleWindow = record.openWindow();
    const activeWindow = record.openWindow();
    vi.advanceTimersByTime(10 * MINUTE);
    activeWindow.inactivityLock.noteActivity();

    vi.advanceTimersByTime(10 * MINUTE);
    expect(idleWindow.lock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5 * MINUTE);
    expect(idleWindow.lock).toHaveBeenCalledTimes(1);
  });

  it("タイマーが止まっていた間（スリープ）に時間が過ぎていたら、戻って最初の操作で延ばさずにロックする", () => {
    const record = sharedActivityRecord();
    const { inactivityLock, lock } = record.openWindow();
    // タイマーを動かさずに時計だけを進める（スリープの間は、タイマーが来ない）。
    vi.setSystemTime(Date.now() + 20 * MINUTE);

    inactivityLock.noteActivity();
    expect(lock).toHaveBeenCalledTimes(1);
    expect(record.writes).toHaveLength(1);
  });

  it("画面に戻ったときに見て、過ぎていればロックし、まだなら残りの時間を数え直す", () => {
    const { inactivityLock, lock } = sharedActivityRecord().openWindow();
    vi.setSystemTime(Date.now() + 5 * MINUTE);
    inactivityLock.check();
    expect(lock).not.toHaveBeenCalled();

    vi.setSystemTime(Date.now() + 10 * MINUTE);
    inactivityLock.check();
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("止めたあとは、時間が過ぎてもロックしない", () => {
    const { inactivityLock, lock } = sharedActivityRecord().openWindow();
    inactivityLock.stop();
    vi.advanceTimersByTime(2 * TIMEOUT_MS);
    inactivityLock.check();
    expect(lock).not.toHaveBeenCalled();
  });
});

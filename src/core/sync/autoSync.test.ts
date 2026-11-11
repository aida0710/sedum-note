import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectStoreError } from "../remote/objectStore";
import { AutoSync, MAX_RETRY_INTERVAL_MILLISECONDS, POLL_INTERVAL_MILLISECONDS, PUSH_DELAY_MILLISECONDS, type SyncStatus } from "./autoSync";
import type { SyncEngine } from "./syncEngine";

const offline = () => new ObjectStoreError("unreachable", "offline");

// 同期の結果を試験から決められる SyncEngine の代わり。
function scriptedEngine() {
  const script = { failure: null as unknown, syncCount: 0 };
  const engine = {
    syncOnce: async () => {
      script.syncCount += 1;
      if (script.failure !== null) {
        throw script.failure;
      }
      return { pulledCount: 0, pushedCount: 0, unreadableIds: [] };
    },
  } as unknown as SyncEngine;
  return { engine, script };
}

function startAutoSync(automatic: boolean) {
  const { engine, script } = scriptedEngine();
  const statuses: SyncStatus[] = [];
  const autoSync = new AutoSync(engine, { automatic, onStatus: (status) => statuses.push(status) });
  return { autoSync, script, lastStatus: () => statuses.at(-1)! };
}

describe("AutoSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("始めるとすぐ同期し、そのあと 1 分おきと、編集の 2 秒後に同期する", async () => {
    const { autoSync, script } = startAutoSync(true);
    autoSync.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(script.syncCount).toBe(1);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MILLISECONDS);
    expect(script.syncCount).toBe(2);
    autoSync.noteLocalChange();
    await vi.advanceTimersByTimeAsync(PUSH_DELAY_MILLISECONDS);
    expect(script.syncCount).toBe(3);
    autoSync.stop();
  });

  it("自動の同期がオフなら、編集しても時間がたっても同期せず、「今すぐ同期」のときだけ同期する", async () => {
    const { autoSync, script } = startAutoSync(false);
    autoSync.start();
    autoSync.noteLocalChange();
    await vi.advanceTimersByTimeAsync(10 * POLL_INTERVAL_MILLISECONDS);
    expect(script.syncCount).toBe(0);
    await autoSync.syncNow();
    expect(script.syncCount).toBe(1);
    await vi.advanceTimersByTimeAsync(10 * POLL_INTERVAL_MILLISECONDS);
    expect(script.syncCount).toBe(1);

    // 入れると、すぐ 1 回同期して、そのあとも続ける。
    autoSync.setAutomatic(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(script.syncCount).toBe(2);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MILLISECONDS);
    expect(script.syncCount).toBe(3);
    autoSync.stop();
  });

  it("つながらない間は、間隔を倍にしながら 5 分まで延ばし、つながったら 1 分おきに戻す", async () => {
    const { autoSync, script, lastStatus } = startAutoSync(true);
    script.failure = offline();
    autoSync.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(lastStatus()).toMatchObject({ state: "failed", willRetry: true });

    // 1 回目の失敗のあとは 2 分後、次は 4 分後、その次からは 5 分後。
    for (const [wait, expectedCount] of [[2, 2], [4, 3], [5, 4], [5, 5]] as const) {
      await vi.advanceTimersByTimeAsync(wait * 60_000 - 1);
      expect(script.syncCount).toBe(expectedCount - 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(script.syncCount).toBe(expectedCount);
    }
    expect(MAX_RETRY_INTERVAL_MILLISECONDS).toBe(5 * 60_000);

    script.failure = null;
    await vi.advanceTimersByTimeAsync(MAX_RETRY_INTERVAL_MILLISECONDS);
    expect(lastStatus().state).toBe("idle");
    const countAfterRecovery = script.syncCount;
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MILLISECONDS);
    expect(script.syncCount).toBe(countAfterRecovery + 1);
    autoSync.stop();
  });

  it("回線が戻ったら、延ばした間隔を待たずに同期する", async () => {
    const { autoSync, script } = startAutoSync(true);
    script.failure = offline();
    autoSync.start();
    await vi.advanceTimersByTimeAsync(0);
    script.failure = null;
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(script.syncCount).toBe(2);
    autoSync.stop();
  });

  it("アクセスキーを断られたら、自動では繰り返さない。「今すぐ同期」で通れば、自動の同期に戻る", async () => {
    const { autoSync, script, lastStatus } = startAutoSync(true);
    script.failure = new ObjectStoreError("forbidden", "refused");
    autoSync.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(lastStatus()).toMatchObject({ state: "failed", willRetry: false });
    autoSync.noteLocalChange();
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(10 * MAX_RETRY_INTERVAL_MILLISECONDS);
    expect(script.syncCount).toBe(1);

    script.failure = null;
    await autoSync.syncNow();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MILLISECONDS);
    expect(script.syncCount).toBe(3);
    autoSync.stop();
  });
});

// 同期をいつ流すかを決める。編集のあと少し待って流し、ほかのデバイスの変更を
// 拾うために一定の間隔でも流す。回線が戻ったときと画面に戻ったときにも流す。

import type { SyncEngine } from "./syncEngine";

// 打ち続けている間に何度も送らないよう、最後の編集からこれだけ待って送る。
export const PUSH_DELAY_MILLISECONDS = 2_000;
// ほかのデバイスの変更を拾う間隔。S3 の一覧の要求は 1 回あたり数百件の記録で 1 往復。
export const POLL_INTERVAL_MILLISECONDS = 60_000;

export type SyncStatus =
  | { state: "idle"; lastSyncedAt: Date | null }
  | { state: "syncing"; lastSyncedAt: Date | null }
  | { state: "failed"; lastSyncedAt: Date | null; error: unknown };

export type AutoSyncCallbacks = {
  onStatus: (status: SyncStatus) => void;
};

export class AutoSync {
  readonly #engine: SyncEngine;
  readonly #callbacks: AutoSyncCallbacks;
  #pushTimer: ReturnType<typeof setTimeout> | null = null;
  #pollTimer: ReturnType<typeof setInterval> | null = null;
  #lastSyncedAt: Date | null = null;
  readonly #syncSoon = () => void this.syncNow();
  readonly #syncWhenVisible = () => {
    if (document.visibilityState === "visible") {
      void this.syncNow();
    }
  };

  constructor(engine: SyncEngine, callbacks: AutoSyncCallbacks) {
    this.#engine = engine;
    this.#callbacks = callbacks;
  }

  start(): void {
    this.#pollTimer = setInterval(this.#syncSoon, POLL_INTERVAL_MILLISECONDS);
    window.addEventListener("online", this.#syncSoon);
    document.addEventListener("visibilitychange", this.#syncWhenVisible);
    void this.syncNow();
  }

  stop(): void {
    if (this.#pollTimer !== null) {
      clearInterval(this.#pollTimer);
    }
    if (this.#pushTimer !== null) {
      clearTimeout(this.#pushTimer);
    }
    window.removeEventListener("online", this.#syncSoon);
    document.removeEventListener("visibilitychange", this.#syncWhenVisible);
  }

  // 手元で何かを変えたときに呼ぶ。
  noteLocalChange(): void {
    if (this.#pushTimer !== null) {
      clearTimeout(this.#pushTimer);
    }
    this.#pushTimer = setTimeout(this.#syncSoon, PUSH_DELAY_MILLISECONDS);
  }

  async syncNow(): Promise<void> {
    this.#callbacks.onStatus({ state: "syncing", lastSyncedAt: this.#lastSyncedAt });
    try {
      await this.#engine.syncOnce();
      this.#lastSyncedAt = new Date();
      this.#callbacks.onStatus({ state: "idle", lastSyncedAt: this.#lastSyncedAt });
    } catch (error) {
      this.#callbacks.onStatus({ state: "failed", lastSyncedAt: this.#lastSyncedAt, error });
    }
  }
}

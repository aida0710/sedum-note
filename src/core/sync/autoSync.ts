// 同期をいつ流すかを決める。編集のあと少し待って流し、ほかのデバイスの変更を拾うために一定の間隔でも流す。
// 回線が戻ったときと画面に戻ったときにも流す。
//
// 考え方は sshc の自動同期に合わせている。
// - 自動で流すかどうかは利用者が決める。オフでも「今すぐ同期」は使える
// - 失敗は黙って繰り返さず、理由を見せる。続けて失敗する間は、間隔を延ばして同期先を叩きすぎない
// - 待っても直らない失敗（認証情報が違う、同期先が別のものになった、アプリが古い）は、利用者が
//   直すまで自動では繰り返さない

import { isPermanentSyncFailure } from "./syncFailure";
import type { SyncEngine, SyncProgress } from "./syncEngine";

// 打ち続けている間に何度も送らないよう、最後の編集からこれだけ待って送る。
export const PUSH_DELAY_MILLISECONDS = 2_000;
// ほかのデバイスの変更を拾う間隔。S3 の一覧の要求は 1 回あたり数百件の記録で 1 往復。
export const POLL_INTERVAL_MILLISECONDS = 60_000;
// 続けて失敗している間の、間隔の上限。失敗のたびに倍にして、ここで止める。
export const MAX_RETRY_INTERVAL_MILLISECONDS = 5 * 60_000;

export type SyncStatus =
  // 同じ vault を開いている、ほかのウィンドウが同期を受け持っている。
  | { state: "delegated" }
  | { state: "idle"; lastSyncedAt: Date | null }
  // progress は、件数の分かる段階（受信・送信）に入ってからの進み具合。それまでは null。
  | { state: "syncing"; lastSyncedAt: Date | null; progress: SyncProgress | null }
  // willRetry が false なら、待っても直らない失敗で、自動の同期を止めている。
  | { state: "failed"; lastSyncedAt: Date | null; error: unknown; willRetry: boolean };

export type AutoSyncOptions = {
  onStatus: (status: SyncStatus) => void;
  // 自動で同期するか。false なら、syncNow を呼んだときだけ同期する。
  automatic: boolean;
};

export class AutoSync {
  readonly #engine: SyncEngine;
  readonly #onStatus: (status: SyncStatus) => void;
  #automatic: boolean;
  #started = false;
  #pushTimer: ReturnType<typeof setTimeout> | null = null;
  #pollTimer: ReturnType<typeof setTimeout> | null = null;
  #lastSyncedAt: Date | null = null;
  // 続けて失敗した回数。成功したら 0 に戻す。
  #consecutiveFailures = 0;
  // 待っても直らない失敗のあと。利用者が「今すぐ同期」を押すか、設定を変えるまで、自動では流さない。
  #stoppedByPermanentFailure = false;
  readonly #syncWhenOnline = () => void this.#syncAutomatically();
  readonly #syncWhenVisible = () => {
    if (document.visibilityState === "visible") {
      void this.#syncAutomatically();
    }
  };

  constructor(engine: SyncEngine, options: AutoSyncOptions) {
    this.#engine = engine;
    this.#onStatus = options.onStatus;
    this.#automatic = options.automatic;
  }

  start(): void {
    this.#started = true;
    window.addEventListener("online", this.#syncWhenOnline);
    document.addEventListener("visibilitychange", this.#syncWhenVisible);
    this.#onStatus({ state: "idle", lastSyncedAt: null });
    void this.#syncAutomatically();
  }

  stop(): void {
    this.#started = false;
    this.#clearTimers();
    window.removeEventListener("online", this.#syncWhenOnline);
    document.removeEventListener("visibilitychange", this.#syncWhenVisible);
  }

  // 自動の同期を入れる・切る。入れたら、すぐ 1 回流す。
  setAutomatic(automatic: boolean): void {
    if (automatic === this.#automatic) {
      return;
    }
    this.#automatic = automatic;
    this.#clearTimers();
    if (automatic && this.#started) {
      void this.#syncAutomatically();
    }
  }

  // 手元で何かを変えたときに呼ぶ。
  noteLocalChange(): void {
    if (!this.#runsAutomatically()) {
      return;
    }
    if (this.#pushTimer !== null) {
      clearTimeout(this.#pushTimer);
    }
    this.#pushTimer = setTimeout(() => void this.#syncAutomatically(), PUSH_DELAY_MILLISECONDS);
  }

  // 利用者が「今すぐ同期」を押したとき。自動の同期がオフでも、失敗で止まっていても流す。
  async syncNow(): Promise<void> {
    this.#stoppedByPermanentFailure = false;
    await this.#sync();
  }

  #runsAutomatically(): boolean {
    return this.#started && this.#automatic && !this.#stoppedByPermanentFailure;
  }

  async #syncAutomatically(): Promise<void> {
    if (this.#runsAutomatically()) {
      await this.#sync();
    }
  }

  async #sync(): Promise<void> {
    this.#clearTimers();
    this.#onStatus({ state: "syncing", lastSyncedAt: this.#lastSyncedAt, progress: null });
    try {
      await this.#engine.syncOnce((progress) => this.#onStatus({ state: "syncing", lastSyncedAt: this.#lastSyncedAt, progress }));
      this.#lastSyncedAt = new Date();
      this.#consecutiveFailures = 0;
      this.#onStatus({ state: "idle", lastSyncedAt: this.#lastSyncedAt });
    } catch (error) {
      this.#consecutiveFailures += 1;
      this.#stoppedByPermanentFailure = isPermanentSyncFailure(error);
      this.#onStatus({ state: "failed", lastSyncedAt: this.#lastSyncedAt, error, willRetry: this.#runsAutomatically() });
    }
    if (this.#runsAutomatically()) {
      // 「今すぐ同期」と自動の同期が重なったときに、予約を 2 つ残さない。
      this.#clearPollTimer();
      this.#pollTimer = setTimeout(() => void this.#syncAutomatically(), this.#nextPollDelay());
    }
  }

  // 次に同期先を見にいくまでの時間。失敗が続く間は、倍にしていく。
  #nextPollDelay(): number {
    return Math.min(POLL_INTERVAL_MILLISECONDS * 2 ** this.#consecutiveFailures, MAX_RETRY_INTERVAL_MILLISECONDS);
  }

  #clearPollTimer(): void {
    if (this.#pollTimer !== null) {
      clearTimeout(this.#pollTimer);
      this.#pollTimer = null;
    }
  }

  #clearTimers(): void {
    this.#clearPollTimer();
    if (this.#pushTimer !== null) {
      clearTimeout(this.#pushTimer);
      this.#pushTimer = null;
    }
  }
}

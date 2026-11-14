// 操作が無いときの自動のロック。最後の操作の時刻は全部のウィンドウで共有し（platform/lastActivityTime.ts）、どのウィンドウでも、
// 共有の時刻から決めた時間が過ぎたらロックする（ロックの合図で、全部のウィンドウがロックされる）。
// 時刻は壁の時計で比べるので、アプリが裏にある間やスリープしていた間も時間は進む。タイマーが止まっていた間に過ぎていたら、
// 画面に戻ったとき（check）か、戻って最初の操作（noteActivity）でロックし、その操作で時間を延ばさない。
// 画面の出来事とのつなぎは useInactivityLock.ts。

// 操作を共有の時刻に書く間隔の下限。マウスを動かしている間ずっと localStorage に書かないため。自動のロックは最短 1 分なので、
// この長さだけロックが早まっても差し支えない。
export const ACTIVITY_RECORD_INTERVAL_MS = 5_000;

type InactivityLockParts = {
  // 操作が無いままこの長さが過ぎたらロックする。
  timeoutMs: number;
  now: () => number;
  readLastActivityTime: () => number | null;
  writeLastActivityTime: (time: number) => void;
  lock: () => void;
};

// 最後の操作から timeoutMs が過ぎたか。
export function isInactivityLockDue({ lastActivityTime, now, timeoutMs }: { lastActivityTime: number; now: number; timeoutMs: number }): boolean {
  return now - lastActivityTime >= timeoutMs;
}

export class InactivityLock {
  readonly #parts: InactivityLockParts;
  // このウィンドウが最後に共有の時刻を書いた時刻。間引きに使う。
  #recordedAt = Number.NEGATIVE_INFINITY;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #stopped = false;

  constructor(parts: InactivityLockParts) {
    this.#parts = parts;
  }

  // ロックを解除したとき（と、時間を変えたとき）に呼ぶ。解除した今を最後の操作として、数え始める。
  start(): void {
    this.#record(this.#parts.now());
    this.#schedule();
  }

  stop(): void {
    this.#stopped = true;
    clearTimeout(this.#timer);
  }

  // キー・マウス・タッチ・スクロールのたびに呼ぶ。ACTIVITY_RECORD_INTERVAL_MS に 1 回だけ書く。書く前に、もう時間が過ぎていれば
  // （スリープから戻って最初の操作など）、書かずにロックする。
  noteActivity(): void {
    const now = this.#parts.now();
    if (this.#stopped || now - this.#recordedAt < ACTIVITY_RECORD_INTERVAL_MS || this.#lockIfDue(now)) {
      return;
    }
    this.#record(now);
  }

  // 時間が過ぎていないかを見る（タイマーが来たとき、画面に戻ったとき）。過ぎていればロックし、まだなら、ほかのウィンドウの操作も
  // 入った共有の時刻から、次に見る時刻を決め直す。
  check(): void {
    if (!this.#stopped && !this.#lockIfDue(this.#parts.now())) {
      this.#schedule();
    }
  }

  #record(now: number): void {
    this.#recordedAt = now;
    this.#parts.writeLastActivityTime(now);
  }

  // 共有の最後の操作の時刻。無いときと、今より先のとき（時計を戻した）は、今を最後の操作として書き直す。
  #lastActivityTime(now: number): number {
    const stored = this.#parts.readLastActivityTime();
    if (stored === null || stored > now) {
      this.#record(now);
      return now;
    }
    return stored;
  }

  #lockIfDue(now: number): boolean {
    if (!isInactivityLockDue({ lastActivityTime: this.#lastActivityTime(now), now, timeoutMs: this.#parts.timeoutMs })) {
      return false;
    }
    this.stop();
    this.#parts.lock();
    return true;
  }

  #schedule(): void {
    clearTimeout(this.#timer);
    const now = this.#parts.now();
    const remaining = this.#lastActivityTime(now) + this.#parts.timeoutMs - now;
    this.#timer = setTimeout(() => this.check(), Math.max(0, remaining));
  }
}

// 新しいバージョンを確かめている最中か、最後に確かめた結果と時刻を持つ。
// ロックを解除したときの自動の確認と、設定の「今すぐ確かめる」が、同じものを使う。
//
// 確かめている間にもう一度確かめたり、結果を消したりしたら、先に始めた確認の結果は捨てる。
// 遅れて返った古い結果で、あとの結果や消した状態を上書きしないため。

import type { UpdateCheckResult } from "./availableUpdate";

export type LastUpdateCheck = { result: UpdateCheckResult; checkedAt: Date };

export type UpdateCheckState = {
  checking: boolean;
  // まだ確かめ終えていなければ null。
  last: LastUpdateCheck | null;
};

export const NOT_CHECKED: UpdateCheckState = { checking: false, last: null };

type UpdateChecksInput = {
  query: () => Promise<UpdateCheckResult>;
  now: () => Date;
  show: (state: UpdateCheckState) => void;
};

export class UpdateChecks {
  readonly #input: UpdateChecksInput;
  #state: UpdateCheckState = NOT_CHECKED;
  // 始めた確認の通し番号。結果が返ったときに、これより前の番号の確認なら捨てる。
  #latestCheck = 0;

  constructor(input: UpdateChecksInput) {
    this.#input = input;
  }

  async check(): Promise<void> {
    const thisCheck = ++this.#latestCheck;
    this.#show({ ...this.#state, checking: true });
    const result = await this.#input.query();
    if (thisCheck === this.#latestCheck) {
      this.#show({ checking: false, last: { result, checkedAt: this.#input.now() } });
    }
  }

  // 自動の確認を止めたとき。確かめている最中の確認の結果も捨てる。
  clear(): void {
    this.#latestCheck += 1;
    this.#show(NOT_CHECKED);
  }

  #show(state: UpdateCheckState): void {
    this.#state = state;
    this.#input.show(state);
  }
}

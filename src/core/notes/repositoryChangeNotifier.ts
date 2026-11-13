// NoteRepository の変更を、購読している画面と同期へ知らせる。
// たくさんの記録を続けて書く間（Markdown の取り込み、同期で受け取った束、ゴミ箱を空にする）は、知らせを止めて最後に 1 回にまとめる。
// 1 件ごとに知らせると、画面がそのたびに全部のメモの一覧を作り直し、件数の 2 乗の時間がかかる（300 件の取り込みで 15 秒）。

// local は、このデバイスで変えたもの（同期で送る必要がある）。stored は、手元の保存や同期から読み直したもの。
export type RepositoryChangeOrigin = "local" | "stored";

type ChangeListener = (origin: RepositoryChangeOrigin) => void;

export class RepositoryChangeNotifier {
  readonly #listeners = new Set<ChangeListener>();
  // holdWhile の中にいる数。入れ子にできる。
  #holdDepth = 0;
  // 止めている間に来た知らせ。local が 1 つでもあれば local にする（同期の予約を落とさないため）。
  #heldOrigin: RepositoryChangeOrigin | null = null;

  subscribe(listener: ChangeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  notify(origin: RepositoryChangeOrigin): void {
    if (this.#holdDepth > 0) {
      this.#heldOrigin = this.#heldOrigin === "local" ? "local" : origin;
      return;
    }
    for (const listener of this.#listeners) {
      listener(origin);
    }
  }

  // work を流す間の知らせを止め、終わったら（失敗しても）まとめて 1 回知らせる。
  async holdWhile<Result>(work: () => Promise<Result>): Promise<Result> {
    this.#holdDepth += 1;
    try {
      return await work();
    } finally {
      this.#holdDepth -= 1;
      const held = this.#heldOrigin;
      if (this.#holdDepth === 0 && held !== null) {
        this.#heldOrigin = null;
        this.notify(held);
      }
    }
  }
}

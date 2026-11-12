// 手元の記録への「読んで、比べて、書く」を 1 つずつ順に流す。
//
// 編集の保存と同期の取り込みが同じ記録を同時に書くと、あとから書いた方が
// 先の変更を消す。どちらもこのキューを通すことで、比べてから書くまでの間に
// ほかの書き込みが割り込まないようにする。

// アプリを 2 つのウィンドウ（Web 版なら 2 つのタブ）で開くと、同じ手元の保存を 2 つの画面が書く。そのときは、
// ウィンドウをまたいで 1 つずつ流す実装（ui/platform/crossWindowWriteQueue.ts）を渡す。
export interface WriteQueue {
  run<Result>(task: () => Promise<Result>): Promise<Result>;
}

// 1 つの画面の中で順に流す実装。
export class SerialQueue implements WriteQueue {
  #tail: Promise<unknown> = Promise.resolve();

  run<Result>(task: () => Promise<Result>): Promise<Result> {
    const result = this.#tail.then(task);
    // 失敗した処理があっても、後ろの処理は流す。失敗は呼び出し側へ返す。
    this.#tail = result.catch(() => undefined);
    return result;
  }
}

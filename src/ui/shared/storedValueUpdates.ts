// 手元に保存した値への変更を、呼んだ順に 1 つずつ書く。変更は、先に呼んだ変更が済んだあとの値から作る。
//
// 画面に出ている値（押した時点の値）から作ると、そのあと（通信を待つ間など）に別の欄で変えた分を、古い値で上書きしてしまう。
// 値は書き終えるのを待たずに show で画面へ出し（チェックや選択がすぐ切り替わるように）、書けなかったら元の値に戻す。

import { SerialQueue } from "../../core/local/serialQueue";

type StoredValueUpdatesInput<Value> = {
  write: (value: Value) => Promise<void>;
  show: (value: Value) => void;
};

export class StoredValueUpdates<Value> {
  readonly #input: StoredValueUpdatesInput<Value>;
  readonly #writes = new SerialQueue();
  // 順番待ちの中で読む、今の値。読み込みが済むまでは null。
  #latest: Value | null = null;

  constructor(input: StoredValueUpdatesInput<Value>) {
    this.#input = input;
  }

  // 保存してある値を読み終えた。
  loaded(value: Value): void {
    this.#latest = value;
    this.#input.show(value);
  }

  // 読み込みが済む前に呼ばれた変更は、捨てる（変える元の値が無い）。
  update(change: (current: Value) => Value): Promise<void> {
    return this.#writes.run(async () => {
      const previous = this.#latest;
      if (previous === null) {
        return;
      }
      const next = change(previous);
      this.#latest = next;
      this.#input.show(next);
      try {
        await this.#input.write(next);
      } catch (error) {
        this.#latest = previous;
        this.#input.show(previous);
        throw error;
      }
    });
  }
}

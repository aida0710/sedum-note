// 持ち手を押したときに開くブロックのメニューの状態を、エディタの拡張（blockDragHandle.ts）から画面の部品
// （BlockMenu.tsx）へ渡す。エディタの拡張は React の外で動くので、あいだに置く（「/」の候補の slashMenuController.ts と同じ形）。

export type BlockMenuState = {
  // メニューを開いた持ち手。メニューはその下に開く。
  anchor: HTMLElement;
  // 持ち手を出していたブロックの位置。
  position: number;
};

export class BlockMenuController {
  #state: BlockMenuState | null = null;
  readonly #listeners = new Set<() => void>();

  readonly state = (): BlockMenuState | null => this.#state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  open(state: BlockMenuState): void {
    this.#state = state;
    this.#notify();
  }

  close(): void {
    if (this.#state !== null) {
      this.#state = null;
      this.#notify();
    }
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

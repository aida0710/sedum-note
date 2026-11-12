// 「/」の候補のメニューの状態を、エディタの拡張（slashCommandExtension.ts）から画面の部品
// （SlashMenu.tsx）へ渡す。エディタの拡張は React の外で動くので、あいだに置く。

import type { SlashCommand, SlashCommandActions } from "./slashCommands";

export type SlashMenuState = {
  commands: SlashCommand[];
  // 「/」を打った位置（画面の座標）。
  anchor: DOMRect;
  choose: (command: SlashCommand) => void;
};

export class SlashMenuController {
  #state: SlashMenuState | null = null;
  readonly #listeners = new Set<() => void>();
  // メニューが出ている間のキー（上下・Enter）の処理。メニューの部品が入れる。処理したら true。
  handleKey: ((event: KeyboardEvent) => boolean) | null = null;
  // 画面を開く操作。NoteEditor が描くたびに入れ直す。
  actions: SlashCommandActions = {
    pickImage: () => undefined, pickFile: () => undefined, pickNoteLink: () => undefined, pickBlockLink: () => undefined, pickBlockEmbed: () => undefined, scanDocument: () => undefined, templates: [], insertTemplate: () => undefined,
  };

  readonly state = (): SlashMenuState | null => this.#state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  show(state: SlashMenuState): void {
    this.#state = state;
    this.#notify();
  }

  hide(): void {
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

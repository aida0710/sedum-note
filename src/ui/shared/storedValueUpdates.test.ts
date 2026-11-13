import { describe, expect, it } from "vitest";
import { StoredValueUpdates } from "./storedValueUpdates";

type Settings = { enabled: boolean; model: string };

// 書き込みを、試験が許すまで終わらせない保存先。
function slowStore() {
  const written: Settings[] = [];
  let allowWrites!: () => void;
  const writesAllowed = new Promise<void>((resolve) => {
    allowWrites = resolve;
  });
  const updates = new StoredValueUpdates<Settings>({
    write: async (value) => {
      await writesAllowed;
      written.push(value);
    },
    show: () => undefined,
  });
  return { updates, written, allowWrites };
}

describe("手元に保存した値への変更", () => {
  it("先の変更を書いている間に呼んだ変更は、先の変更の結果から作り、呼んだ順に書く", async () => {
    const { updates, written, allowWrites } = slowStore();
    updates.loaded({ enabled: false, model: "opus" });

    const first = updates.update((current) => ({ ...current, model: "sonnet" }));
    const second = updates.update((current) => ({ ...current, enabled: true }));
    allowWrites();
    await Promise.all([first, second]);

    expect(written).toEqual([{ enabled: false, model: "sonnet" }, { enabled: true, model: "sonnet" }]);
  });

  it("書く前に画面へ出し、書けなかったら元の値に戻して失敗を返す。次の変更は戻した値から作る", async () => {
    const shown: Settings[] = [];
    const written: Settings[] = [];
    let failsNextWrite = true;
    const updates = new StoredValueUpdates<Settings>({
      write: async (value) => {
        if (failsNextWrite) {
          failsNextWrite = false;
          throw new Error("disk full");
        }
        written.push(value);
      },
      show: (value) => shown.push(value),
    });
    updates.loaded({ enabled: false, model: "opus" });

    await expect(updates.update((current) => ({ ...current, enabled: true }))).rejects.toThrow("disk full");
    expect(shown).toEqual([{ enabled: false, model: "opus" }, { enabled: true, model: "opus" }, { enabled: false, model: "opus" }]);

    await updates.update((current) => ({ ...current, model: "haiku" }));
    expect(written).toEqual([{ enabled: false, model: "haiku" }]);
  });

  it("読み込みが済む前の変更は書かない", async () => {
    const { updates, written, allowWrites } = slowStore();
    allowWrites();
    await updates.update((current) => ({ ...current, enabled: true }));
    expect(written).toEqual([]);
  });
});

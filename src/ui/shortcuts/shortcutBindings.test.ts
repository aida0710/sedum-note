import { beforeEach, describe, expect, it } from "vitest";
import { readDevicePreferences, resetDevicePreferences } from "../preferences/devicePreferences";
import { assignShortcutKeys, resetAllShortcutKeys, resetShortcutKeys, shortcutBindings, shortcutKeysOf } from "./shortcutBindings";
import { settledShortcutOverrides } from "./shortcutOverrides";

beforeEach(() => {
  resetDevicePreferences();
});

describe("ショートカットのキーの割り当て", () => {
  it("キーを変えると、そのキーで照合する。既定のキーに戻すと、変えた記録を消す", () => {
    expect(assignShortcutKeys("newNote", { key: "m", alt: true })).toBeNull();
    expect(shortcutKeysOf("newNote")).toEqual({ key: "m", alt: true });
    expect(shortcutBindings(["newNote"])).toEqual([{ id: "newNote", keys: { key: "m", alt: true } }]);
    expect(assignShortcutKeys("newNote", { key: "n", alt: true })).toBeNull();
    expect(readDevicePreferences().shortcutOverrides).toEqual({});
  });

  it("ほかのショートカットが使っているキーと、エディタや OS が使うキーは割り当てない", () => {
    expect(assignShortcutKeys("newNote", { key: "k" })).toEqual({ kind: "inUse", shortcutId: "commandPalette" });
    expect(assignShortcutKeys("duplicateBlock", { key: "f", alt: true })).toEqual({ kind: "inUse", shortcutId: "focusMode" });
    expect(assignShortcutKeys("newNote", { key: "b" })).toEqual({ kind: "reserved" });
    expect(assignShortcutKeys("newNote", { key: "ArrowLeft" })).toEqual({ kind: "reserved" });
    expect(readDevicePreferences().shortcutOverrides).toEqual({});
  });

  it("キーなしにしたショートカットは照合に入れず、そのキーをほかに使える。既定のキーをほかが使っていれば、既定に戻さない", () => {
    assignShortcutKeys("commandPalette", null);
    expect(shortcutBindings(["commandPalette"])).toEqual([]);
    expect(assignShortcutKeys("newNote", { key: "k" })).toBeNull();
    expect(resetShortcutKeys("commandPalette")).toEqual({ kind: "inUse", shortcutId: "newNote" });
    resetAllShortcutKeys();
    expect(shortcutKeysOf("commandPalette")).toEqual({ key: "k" });
    expect(shortcutKeysOf("newNote")).toEqual({ key: "n", alt: true });
  });

  it("保存した値のうち、知らないショートカットと読めないキーは捨てる", () => {
    expect(settledShortcutOverrides({ newNote: { key: "m", alt: true, extra: 1 }, lock: null, gone: { key: "x" }, graph: { key: 3 }, aiChat: { key: "q", shift: "yes" } }))
      .toEqual({ newNote: { key: "m", alt: true }, lock: null });
  });
});

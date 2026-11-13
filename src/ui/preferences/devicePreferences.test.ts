import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "sedum-note:devicePreferences";

// 読み込んだ設定はモジュールの中に覚えるので、試験ごとに読み込み直す。
async function preferencesLoadedFrom(stored: Record<string, unknown>) {
  const storage = new Map([[STORAGE_KEY, JSON.stringify(stored)]]);
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  const { readDevicePreferences } = await import("./devicePreferences");
  return readDevicePreferences();
}

describe("このデバイスの表示の設定", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("前の版でデイリーノートの題の形式として選んだ形式を、テンプレートの日付と時刻の形式として引き継ぐ", async () => {
    expect((await preferencesLoadedFrom({ dailyNoteTitleFormat: "long" })).templateDateFormat).toBe("long");
  });

  it("テンプレートの日付と時刻の形式を選び直したら、前の版の値より、選び直した値を使う", async () => {
    expect((await preferencesLoadedFrom({ dailyNoteTitleFormat: "long", templateDateFormat: "iso" })).templateDateFormat).toBe("iso");
  });
});

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

  it("選んだテンプレートの日付と時刻の形式を読む", async () => {
    expect((await preferencesLoadedFrom({ templateDateFormat: "long" })).templateDateFormat).toBe("long");
  });

  it("知らないテンプレートの日付と時刻の形式は、既定の形式に戻す", async () => {
    expect((await preferencesLoadedFrom({ templateDateFormat: "unknown" })).templateDateFormat).toBe("iso");
  });
});

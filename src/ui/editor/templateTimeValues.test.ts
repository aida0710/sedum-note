import { describe, expect, it } from "vitest";
import { templateTimeValues } from "./templateTimeValues";

describe("テンプレートの変数に入れる日付と時刻", () => {
  it("iso の形式は、数字だけの日付と 24 時間の時刻にする。1 桁の月・日・時・分は 0 で埋める", () => {
    const now = new Date(2026, 0, 5, 9, 5);
    expect(templateTimeValues({ now, language: "ja", dateFormat: "iso" })).toEqual({ date: "2026-01-05", time: "09:05", datetime: "2026-01-05 09:05" });
    expect(templateTimeValues({ now: new Date(2026, 10, 13, 21, 30), language: "en", dateFormat: "iso" }).time).toBe("21:30");
  });

  it("long の形式は、その言語の書き方にする（「日付の挿入」と同じ）", () => {
    const now = new Date(2026, 10, 13, 9, 5);
    expect(templateTimeValues({ now, language: "ja", dateFormat: "long" })).toEqual({ date: "2026年11月13日", time: "9:05", datetime: "2026年11月13日 9:05" });
    const english = templateTimeValues({ now, language: "en", dateFormat: "long" });
    expect(english.date).toBe("November 13, 2026");
    // 時刻と AM の間の空白は、ICU の版によって狭い空白（U+202F）になる。
    expect(english.time).toMatch(/^9:05\sAM$/u);
  });

  it("日付は、デバイスのタイムゾーンの日付で、真夜中に次の日になる", () => {
    const lastMinute = templateTimeValues({ now: new Date(2026, 10, 13, 23, 59), language: "ja", dateFormat: "iso" });
    const midnight = templateTimeValues({ now: new Date(2026, 10, 14, 0, 0), language: "ja", dateFormat: "iso" });
    expect([lastMinute.date, lastMinute.time]).toEqual(["2026-11-13", "23:59"]);
    expect([midnight.date, midnight.time]).toEqual(["2026-11-14", "00:00"]);
    expect(templateTimeValues({ now: new Date(2026, 10, 14, 0, 0), language: "ja", dateFormat: "long" }).date).toBe("2026年11月14日");
  });
});

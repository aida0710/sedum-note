import { describe, expect, it } from "vitest";
import { inactivityLockAmountOf, isInactivityLockMinutes, parseInactivityLockInput } from "./inactivityLockMinutes";

describe("自動でロックするまでの時間の指定", () => {
  it("分と時間の単位で入れた数を、分にする", () => {
    expect(parseInactivityLockInput("90", "minutes")).toEqual({ minutes: 90 });
    expect(parseInactivityLockInput(" 2 ", "hours")).toEqual({ minutes: 120 });
  });

  it("1 分から 7 日（168 時間）までを受け付け、外れた値は範囲の外として断る", () => {
    expect(parseInactivityLockInput("1", "minutes")).toEqual({ minutes: 1 });
    expect(parseInactivityLockInput("168", "hours")).toEqual({ minutes: 10_080 });
    expect(parseInactivityLockInput("0", "minutes")).toEqual({ invalid: "outOfRange" });
    expect(parseInactivityLockInput("169", "hours")).toEqual({ invalid: "outOfRange" });
    expect(parseInactivityLockInput("-5", "minutes")).toEqual({ invalid: "outOfRange" });
  });

  it("空や、整数でない数は、整数でないとして断る", () => {
    expect(parseInactivityLockInput("", "minutes")).toEqual({ invalid: "notWholeNumber" });
    expect(parseInactivityLockInput("1.5", "hours")).toEqual({ invalid: "notWholeNumber" });
    expect(parseInactivityLockInput("abc", "minutes")).toEqual({ invalid: "notWholeNumber" });
  });

  it("保存した時間は、時間で割り切れれば時間、そうでなければ分で見せる", () => {
    expect(inactivityLockAmountOf(180)).toEqual({ amount: 3, unit: "hours" });
    expect(inactivityLockAmountOf(90)).toEqual({ amount: 90, unit: "minutes" });
  });

  it("保存してある値は、範囲の中の整数の分だけを読む", () => {
    expect(isInactivityLockMinutes(15)).toBe(true);
    expect(isInactivityLockMinutes(0)).toBe(false);
    expect(isInactivityLockMinutes(10_081)).toBe(false);
    expect(isInactivityLockMinutes(1.5)).toBe(false);
    expect(isInactivityLockMinutes("15")).toBe(false);
  });
});

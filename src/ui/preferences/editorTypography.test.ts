import { describe, expect, it } from "vitest";
import { DEFAULT_EDITOR_TYPOGRAPHY, settledEditorTypography } from "./editorTypography";

describe("本文の文字の組み方", () => {
  it("範囲の外の値は端に収め、刻みに合わない値は近い刻みにする", () => {
    expect(settledEditorTypography({ fontSize: 40, letterSpacing: -1, lineHeight: 1.83 })).toEqual({ fontSize: 24, letterSpacing: 0, lineHeight: 1.85 });
    expect(settledEditorTypography({ fontSize: 15.4, letterSpacing: 0.051, lineHeight: 2 })).toEqual({ fontSize: 15, letterSpacing: 0.05, lineHeight: 2 });
  });

  it("読めない値（前のバージョンの small などの名前や、数でないもの）は標準に戻す", () => {
    expect(settledEditorTypography(undefined)).toEqual(DEFAULT_EDITOR_TYPOGRAPHY);
    expect(settledEditorTypography({ fontSize: "medium", letterSpacing: null, lineHeight: Number.NaN })).toEqual(DEFAULT_EDITOR_TYPOGRAPHY);
  });
});

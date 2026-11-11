import { describe, expect, it } from "vitest";
import { BUILT_IN_THEMES, DARK_THEME, LIGHT_THEME } from "./builtInThemes";
import { contrastRatio, readableTextColorOn } from "./colorContrast";
import { findContrastProblems, parseStoredCustomTheme, schemeOfColors } from "./customTheme";

describe("contrastRatio", () => {
  it("黒と白は 21、同じ色は 1 になる", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1);
  });
});

describe("readableTextColorOn", () => {
  it("濃い塗りには白、淡い塗りには黒に近い色を返す", () => {
    expect(readableTextColorOn("#2f6fde")).toBe("#ffffff");
    expect(readableTextColorOn("#6cc491")).toBe("#16181c");
  });
});

describe("組み込みのテーマ", () => {
  it.each(BUILT_IN_THEMES.map((theme) => [theme.id, theme] as const))("%s は自作テーマと同じコントラストの下限を満たす", (_id, theme) => {
    expect(findContrastProblems(theme.colors)).toEqual([]);
    expect(schemeOfColors(theme.colors)).toBe(theme.scheme);
  });
});

describe("findContrastProblems", () => {
  it("文字と地の色が近いと、その組み合わせを問題として返す", () => {
    const problems = findContrastProblems({ ...LIGHT_THEME.colors, text: "#dddddd" });
    expect(problems.map((problem) => `${problem.foreground}/${problem.background}`)).toEqual(["text/panel", "text/sidebar", "text/canvas"]);
  });
});

describe("parseStoredCustomTheme", () => {
  it("保存してあったテーマを読み、明るさを色から決め直す", () => {
    const parsed = parseStoredCustomTheme({ id: "custom-1", name: "夜", scheme: "light", colors: DARK_THEME.colors });
    expect(parsed).toEqual({ id: "custom-1", name: "夜", scheme: "dark", colors: DARK_THEME.colors });
  });

  it("色が欠けている・色の形でない・読めない組み合わせのテーマは捨てる", () => {
    expect(parseStoredCustomTheme({ id: "a", name: "a", colors: { ...LIGHT_THEME.colors, accent: undefined } })).toBeNull();
    expect(parseStoredCustomTheme({ id: "a", name: "a", colors: { ...LIGHT_THEME.colors, accent: "red; background: url(x)" } })).toBeNull();
    expect(parseStoredCustomTheme({ id: "a", name: "a", colors: { ...LIGHT_THEME.colors, text: "#ffffff" } })).toBeNull();
  });
});

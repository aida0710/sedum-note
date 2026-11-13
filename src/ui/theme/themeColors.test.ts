import { describe, expect, it } from "vitest";
import { BUILT_IN_THEMES, DARK_THEME, LIGHT_THEME } from "./builtInThemes";
import { contrastRatio, readableTextColorOn } from "./colorContrast";
import { findContrastProblems, parseStoredCustomTheme, schemeOfColors } from "./customTheme";
import { raisedSurfaceColor } from "./raisedSurfaceColor";

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

// 小さい文字（12〜13px）に使う色が、載る地の上で読めること。WCAG の「17pt 以下は 4.5:1」。
const SMALL_TEXT_MINIMUM_CONTRAST = 4.5;

describe("組み込みのテーマの小さい文字", () => {
  const themes = BUILT_IN_THEMES.map((theme) => [theme.id, theme] as const);

  it.each(themes)("%s の補助の文字（muted）は、本文・左の列・選んだ行・タグの地の上で読める", (_id, theme) => {
    for (const background of ["panel", "sidebar", "canvas", "selected", "tag"] as const) {
      expect(contrastRatio(theme.colors.muted, theme.colors[background]), background).toBeGreaterThanOrEqual(SMALL_TEXT_MINIMUM_CONTRAST);
    }
  });

  it.each(themes)("%s の成功の色（ok）は、文字として本文とコードの地の上で読める", (_id, theme) => {
    for (const background of ["panel", "tag"] as const) {
      expect(contrastRatio(theme.colors.ok, theme.colors[background]), background).toBeGreaterThanOrEqual(SMALL_TEXT_MINIMUM_CONTRAST);
    }
  });

  it.each(themes)("%s の浮いた面（メニュー・ダイアログ）は、暗いテーマでは本文の地より明るく、文字は読める", (_id, theme) => {
    const raised = raisedSurfaceColor(theme.colors);
    if (theme.scheme === "dark") {
      expect(contrastRatio(raised, theme.colors.panel)).toBeGreaterThan(1.1);
    } else {
      expect(raised).toBe(theme.colors.panel);
    }
    expect(contrastRatio(theme.colors.muted, raised)).toBeGreaterThanOrEqual(SMALL_TEXT_MINIMUM_CONTRAST);
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

// アプリに入っているテーマ。light と dark は、選ばれた案C の色。

import type { Theme } from "./themeColors";

export type BuiltInThemeId = "light" | "dark" | "sedum" | "sedumDark" | "sepia" | "midnight";
export type BuiltInTheme = Theme & { id: BuiltInThemeId };

export const LIGHT_THEME: BuiltInTheme = {
  id: "light",
  scheme: "light",
  colors: {
    canvas: "#f7f7f5", panel: "#ffffff", sidebar: "#f1f1ee", line: "#e4e4df", text: "#1f2328", muted: "#63676e",
    accent: "#2f6fde", accentSoft: "#e6eefc", selected: "#e9edf5", tag: "#f0efe9", ok: "#187733", danger: "#cf222e",
  },
};

export const DARK_THEME: BuiltInTheme = {
  id: "dark",
  scheme: "dark",
  colors: {
    canvas: "#16181c", panel: "#1d2025", sidebar: "#191b20", line: "#2c3038", text: "#e6e8eb", muted: "#9aa1ab",
    accent: "#5b8ff0", accentSoft: "#24324d", selected: "#2a2f39", tag: "#2a2d33", ok: "#3fb950", danger: "#f85149",
  },
};

const SEDUM_THEME: BuiltInTheme = {
  id: "sedum",
  scheme: "light",
  colors: {
    canvas: "#f6f7f3", panel: "#ffffff", sidebar: "#eef1ea", line: "#dfe4d8", text: "#1f2a22", muted: "#5d665d",
    accent: "#2f7d54", accentSoft: "#e3f1e8", selected: "#e4eadf", tag: "#edf0e7", ok: "#187733", danger: "#cf222e",
  },
};

const SEDUM_DARK_THEME: BuiltInTheme = {
  id: "sedumDark",
  scheme: "dark",
  colors: {
    canvas: "#141a16", panel: "#1a211c", sidebar: "#161c18", line: "#2a342c", text: "#e3e9e4", muted: "#97a39a",
    accent: "#6cc491", accentSoft: "#1f3a2b", selected: "#26302a", tag: "#242c26", ok: "#3fb950", danger: "#f85149",
  },
};

const SEPIA_THEME: BuiltInTheme = {
  id: "sepia",
  scheme: "light",
  colors: {
    canvas: "#f4ecd8", panel: "#fbf5e6", sidebar: "#efe5cc", line: "#e0d3b4", text: "#3b2f20", muted: "#6b5c46",
    accent: "#a3561a", accentSoft: "#f3e2c7", selected: "#e8dcbf", tag: "#efe3c8", ok: "#376d29", danger: "#b3261e",
  },
};

const MIDNIGHT_THEME: BuiltInTheme = {
  id: "midnight",
  scheme: "dark",
  colors: {
    canvas: "#000000", panel: "#0a0a0c", sidebar: "#050506", line: "#232329", text: "#e8e8ea", muted: "#9a9aa3",
    accent: "#7aa2ff", accentSoft: "#16233f", selected: "#1c1c22", tag: "#18181c", ok: "#3fb950", danger: "#f85149",
  },
};

export const BUILT_IN_THEMES: readonly BuiltInTheme[] = [LIGHT_THEME, DARK_THEME, SEDUM_THEME, SEDUM_DARK_THEME, SEPIA_THEME, MIDNIGHT_THEME];

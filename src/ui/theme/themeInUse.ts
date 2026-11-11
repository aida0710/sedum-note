// 設定から、いま画面に使うテーマを決める。

import { useMemo } from "react";
import { type DevicePreferences, SYSTEM_THEME_ID, useDevicePreferences } from "../preferences/devicePreferences";
import { useMediaQuery } from "../shared/useMediaQuery";
import { BUILT_IN_THEMES, DARK_THEME, LIGHT_THEME } from "./builtInThemes";
import type { Theme } from "./themeColors";

export const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

type ThemeChoice = Pick<DevicePreferences, "themeId" | "customThemes">;

// 選んだテーマが無くなっていたら（自作テーマを消したあとなど）、OS の明るさに合わせる。
export function resolveTheme({ themeId, customThemes }: ThemeChoice, systemPrefersDark: boolean): Theme {
  const chosen = themeId === SYSTEM_THEME_ID
    ? undefined
    : [...BUILT_IN_THEMES, ...customThemes].find((theme) => theme.id === themeId);
  return chosen ?? (systemPrefersDark ? DARK_THEME : LIGHT_THEME);
}

export function useThemeInUse(): Theme {
  const { themeId, customThemes } = useDevicePreferences();
  const systemPrefersDark = useMediaQuery(SYSTEM_DARK_QUERY);
  return useMemo(() => resolveTheme({ themeId, customThemes }, systemPrefersDark), [themeId, customThemes, systemPrefersDark]);
}

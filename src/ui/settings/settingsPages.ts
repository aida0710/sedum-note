// 設定のページの一覧。設定の欄を、何のための設定かでページに分ける（1 ページに全部並べると長すぎるため）。
// どの欄をどのページに置くかは SettingsPanel が決める。

import { Database, Download, Info, Keyboard, type LucideIcon, Palette, Puzzle, RefreshCw, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import type { MessageKey } from "../i18n/translate";

export const SETTINGS_PAGES = ["general", "appearance", "sync", "data", "security", "shortcuts", "ai", "plugins", "update", "about"] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

// PC で設定を開いたときに、まだページを選んでいなければ出すページ。
export const FIRST_SETTINGS_PAGE: SettingsPage = "general";

export const SETTINGS_PAGE_META: Record<SettingsPage, { label: MessageKey; icon: LucideIcon }> = {
  general: { label: "settings.page.general", icon: SlidersHorizontal },
  appearance: { label: "settings.page.appearance", icon: Palette },
  sync: { label: "settings.page.sync", icon: RefreshCw },
  data: { label: "settings.page.data", icon: Database },
  security: { label: "settings.page.security", icon: ShieldCheck },
  shortcuts: { label: "settings.page.shortcuts", icon: Keyboard },
  ai: { label: "settings.page.ai", icon: Sparkles },
  plugins: { label: "settings.page.plugins", icon: Puzzle },
  update: { label: "settings.page.update", icon: Download },
  about: { label: "settings.page.about", icon: Info },
};

// その画面で出すページ。キーボードの無い画面（スマホ）には、ショートカットのページを出さない。
export function settingsPagesFor({ isMobile }: { isMobile: boolean }): SettingsPage[] {
  return SETTINGS_PAGES.filter((page) => !(isMobile && page === "shortcuts"));
}

// コマンドパレットから探せる設定の項目。項目の名前は、設定の画面の見出しや入力欄の名前と同じ文言を使う
// （選んだら、その文字の要素を探してスクロールするので。revealSetting.ts）。

import type { MessageKey } from "../i18n/translate";
import type { SettingsPage } from "./settingsPages";

export type SettingsSearchEntry = {
  label: MessageKey;
  page: SettingsPage;
  // その版にだけある項目。desktopApp は PC 版（デスクトップのアプリ）、androidApp は Android のアプリ。
  onlyIn?: "desktopApp" | "androidApp";
};

export const SETTINGS_SEARCH_ENTRIES: SettingsSearchEntry[] = [
  { label: "settings.display", page: "general" },
  { label: "settings.language", page: "general" },
  { label: "settings.noteSortOrder", page: "general" },
  { label: "settings.editorFontSize", page: "general" },
  { label: "settings.editorLetterSpacing", page: "general" },
  { label: "settings.editorLineHeight", page: "general" },
  { label: "settings.pageAlignment", page: "general" },
  { label: "settings.imageAttachment", page: "general" },
  { label: "settings.typewriterMode", page: "general" },
  { label: "settings.vibration", page: "general", onlyIn: "androidApp" },
  { label: "settings.hapticFeedback", page: "general", onlyIn: "androidApp" },
  { label: "settings.templates", page: "general" },
  { label: "settings.templateDateFormat", page: "general" },
  { label: "settings.reminders", page: "general" },
  { label: "reminders.notify", page: "general" },
  { label: "reminders.stayResident", page: "general", onlyIn: "desktopApp" },
  { label: "settings.spaces", page: "general" },
  { label: "settings.plugins", page: "plugins" },
  { label: "settings.trash", page: "general" },
  { label: "trash.autoDelete", page: "general" },
  { label: "trash.retentionDays", page: "general" },
  { label: "settings.theme", page: "appearance" },
  { label: "settings.customCss", page: "appearance" },
  { label: "settings.customCssEnabled", page: "appearance" },
  { label: "settings.sync", page: "sync" },
  { label: "settings.autoSync", page: "sync" },
  { label: "settings.syncNow", page: "sync" },
  { label: "syncSetup.export", page: "sync" },
  { label: "syncSetup.pickFile", page: "sync" },
  { label: "settings.syncKey", page: "sync" },
  { label: "settings.backup", page: "data" },
  { label: "settings.markdown", page: "data" },
  { label: "settings.markdownImport", page: "data" },
  { label: "settings.passphrase", page: "security" },
  { label: "settings.lock", page: "security" },
  { label: "wipe.title", page: "security" },
  { label: "settings.shortcuts", page: "shortcuts" },
  { label: "settings.mcp", page: "ai", onlyIn: "desktopApp" },
  { label: "mcp.enable", page: "ai", onlyIn: "desktopApp" },
  { label: "mcp.allowPermanentDelete", page: "ai", onlyIn: "desktopApp" },
  { label: "settings.ai", page: "ai" },
  { label: "ai.enable", page: "ai" },
  { label: "ai.provider", page: "ai" },
  { label: "ai.apiKey", page: "ai" },
  { label: "ai.model", page: "ai" },
  { label: "ai.permissions", page: "ai" },
  { label: "settings.update", page: "update" },
  { label: "update.checkNow", page: "update" },
  { label: "update.checkOnStart", page: "update" },
];

type AppKinds = { isDesktopApp: boolean; isAndroidApp: boolean };

// 今の版にある項目だけを返す（ほかの版にだけある欄は、探しても開いた先に無いので出さない）。
export function settingsSearchEntriesFor({ isDesktopApp, isAndroidApp }: AppKinds): SettingsSearchEntry[] {
  return SETTINGS_SEARCH_ENTRIES.filter(({ onlyIn }) => onlyIn === undefined || (onlyIn === "desktopApp" ? isDesktopApp : isAndroidApp));
}

// コマンドパレットから探せる設定の項目。項目の名前は、設定の画面の見出しや入力欄の名前と同じ文言を使う
// （選んだら、その文字の要素を探してスクロールするので。revealSetting.ts）。

import type { MessageKey } from "../i18n/translate";
import type { SettingsPage } from "./settingsPages";

export type SettingsSearchEntry = {
  label: MessageKey;
  page: SettingsPage;
  // PC 版（デスクトップのアプリ）にだけある項目。
  desktopAppOnly?: boolean;
};

export const SETTINGS_SEARCH_ENTRIES: SettingsSearchEntry[] = [
  { label: "settings.display", page: "general" },
  { label: "settings.language", page: "general" },
  { label: "settings.noteSortOrder", page: "general" },
  { label: "settings.editorFontSize", page: "general" },
  { label: "settings.pageAlignment", page: "general" },
  { label: "settings.imageAttachment", page: "general" },
  { label: "settings.typewriterMode", page: "general" },
  { label: "settings.dailyNote", page: "general" },
  { label: "settings.dailyNoteTitleFormat", page: "general" },
  { label: "settings.dailyNoteNotebook", page: "general" },
  { label: "settings.trash", page: "general" },
  { label: "trash.autoDelete", page: "general" },
  { label: "settings.theme", page: "appearance" },
  { label: "settings.customCss", page: "appearance" },
  { label: "settings.sync", page: "sync" },
  { label: "settings.autoSync", page: "sync" },
  { label: "syncSetup.export", page: "sync" },
  { label: "settings.syncKey", page: "sync" },
  { label: "settings.backup", page: "data" },
  { label: "settings.markdown", page: "data" },
  { label: "settings.passphrase", page: "security" },
  { label: "settings.lock", page: "security" },
  { label: "wipe.title", page: "security" },
  { label: "settings.shortcuts", page: "shortcuts" },
  { label: "settings.mcp", page: "ai", desktopAppOnly: true },
  { label: "settings.ai", page: "ai" },
  { label: "settings.update", page: "update" },
  { label: "update.checkOnStart", page: "update" },
];

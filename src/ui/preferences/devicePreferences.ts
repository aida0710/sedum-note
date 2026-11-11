// このデバイスだけの表示の設定（言語、一覧の並び順、テーマ、本文の文字の大きさ、更新の確認）。メモの中身ではないので暗号化せず、
// ロック解除の前の画面でも読めるように localStorage に置く。同期はしない。

import { useSyncExternalStore } from "react";
import { type CustomTheme, parseStoredCustomTheme } from "../theme/customTheme";
import { NOTE_SORT_ORDERS, type NoteSortOrder } from "../../core/notes/noteQueries";

// Web 版はほかのページと同じ origin（github.io）に載るので、キーにアプリの名前を付ける。
const STORAGE_KEY = "sedum-note:devicePreferences";

export const LANGUAGE_CHOICES = ["system", "ja", "en"] as const;
export type LanguageChoice = (typeof LANGUAGE_CHOICES)[number];

export const SYSTEM_THEME_ID = "system";

export const EDITOR_FONT_SIZES = ["small", "medium", "large"] as const;
export type EditorFontSize = (typeof EDITOR_FONT_SIZES)[number];

export type DevicePreferences = {
  language: LanguageChoice;
  noteSortOrder: NoteSortOrder;
  // "system"（OS の明るさに合わせる）か、組み込みのテーマか自作のテーマの ID。
  themeId: string;
  customThemes: CustomTheme[];
  editorFontSize: EditorFontSize;
  // アプリを開いたときに、新しいバージョンがあるかを確かめる（GitHub へつなぐ）。
  checkForUpdates: boolean;
};

export const DEFAULT_DEVICE_PREFERENCES: DevicePreferences = {
  language: "system",
  noteSortOrder: "updatedAt",
  themeId: SYSTEM_THEME_ID,
  customThemes: [],
  editorFontSize: "medium",
  checkForUpdates: true,
};

let current: DevicePreferences | null = null;
const listeners = new Set<() => void>();

export function readDevicePreferences(): DevicePreferences {
  current ??= loadStoredPreferences();
  return current;
}

export function updateDevicePreferences(changes: Partial<DevicePreferences>): void {
  current = { ...readDevicePreferences(), ...changes };
  browserStorage()?.setItem(STORAGE_KEY, JSON.stringify(current));
  notifyListeners();
}

// 「このデバイスのデータを消す」で使う。
export function resetDevicePreferences(): void {
  current = DEFAULT_DEVICE_PREFERENCES;
  browserStorage()?.removeItem(STORAGE_KEY);
  notifyListeners();
}

export function useDevicePreferences(): DevicePreferences {
  return useSyncExternalStore(subscribe, readDevicePreferences);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function loadStoredPreferences(): DevicePreferences {
  const stored = browserStorage()?.getItem(STORAGE_KEY);
  if (!stored) {
    return DEFAULT_DEVICE_PREFERENCES;
  }
  try {
    return validPreferences(JSON.parse(stored));
  } catch {
    return DEFAULT_DEVICE_PREFERENCES;
  }
}

// 読めない項目だけを既定に戻す（手で書き換えた値や、別のバージョンの値で画面が壊れないように）。
function validPreferences(stored: unknown): DevicePreferences {
  const candidate = (typeof stored === "object" && stored !== null ? stored : {}) as Partial<Record<keyof DevicePreferences, unknown>>;
  return {
    language: LANGUAGE_CHOICES.find((choice) => choice === candidate.language) ?? DEFAULT_DEVICE_PREFERENCES.language,
    noteSortOrder: NOTE_SORT_ORDERS.find((order) => order === candidate.noteSortOrder) ?? DEFAULT_DEVICE_PREFERENCES.noteSortOrder,
    themeId: typeof candidate.themeId === "string" ? candidate.themeId : DEFAULT_DEVICE_PREFERENCES.themeId,
    customThemes: (Array.isArray(candidate.customThemes) ? candidate.customThemes : [])
      .map(parseStoredCustomTheme)
      .filter((theme) => theme !== null),
    editorFontSize: EDITOR_FONT_SIZES.find((size) => size === candidate.editorFontSize) ?? DEFAULT_DEVICE_PREFERENCES.editorFontSize,
    checkForUpdates: typeof candidate.checkForUpdates === "boolean" ? candidate.checkForUpdates : DEFAULT_DEVICE_PREFERENCES.checkForUpdates,
  };
}

// 試験（Node）とプライベートウィンドウでは localStorage が無い・使えないことがある。
function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

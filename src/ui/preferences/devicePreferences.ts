// このデバイスだけの表示の設定（言語、一覧の並び順、テーマ、本文の文字の組み方、更新の確認、ゴミ箱の自動削除、目次を出すか、写真を貼るときの大きさ、左の列の幅、同期を自動で流すか、デイリーノートの作り方、タイプライターモード、カスタム CSS、期限の通知、常駐）。メモの中身ではないので暗号化せず、
// ロック解除の前の画面でも読めるように localStorage に置く。同期はしない。

import { useSyncExternalStore } from "react";
import { type CustomTheme, parseStoredCustomTheme } from "../theme/customTheme";
import { PAGE_ALIGNMENTS, type PageAlignment } from "../../core/notes/noteRecords";
import { NOTE_SORT_ORDERS, type NoteSortOrder } from "../../core/notes/noteQueries";
import { DAILY_NOTE_TITLE_FORMATS, type DailyNoteTitleFormat } from "../workspace/dailyNote";
import { DEFAULT_EDITOR_TYPOGRAPHY, type EditorTypography, settledEditorTypography } from "./editorTypography";
import { type ShortcutOverrides, settledShortcutOverrides } from "../shortcuts/shortcutOverrides";

// Web 版はほかのページと同じ origin（github.io）に載るので、キーにアプリの名前を付ける。
const STORAGE_KEY = "sedum-note:devicePreferences";

export const LANGUAGE_CHOICES = ["system", "ja", "en"] as const;
export type LanguageChoice = (typeof LANGUAGE_CHOICES)[number];

export const SYSTEM_THEME_ID = "system";

export const IMAGE_ATTACHMENT_CHOICES = ["original", "reduced", "ask"] as const;
export type ImageAttachmentChoice = (typeof IMAGE_ATTACHMENT_CHOICES)[number];

export type DevicePreferences = {
  language: LanguageChoice;
  noteSortOrder: NoteSortOrder;
  // "system"（OS の明るさに合わせる）か、組み込みのテーマか自作のテーマの ID。
  themeId: string;
  customThemes: CustomTheme[];
  // 本文の文字の大きさ・字の間・行の間。
  editorTypography: EditorTypography;
  // アプリを開いたときに、新しいバージョンがあるかを確かめる（GitHub へつなぐ）。
  checkForUpdates: boolean;
  // ゴミ箱に入れてからこの日数がたったメモを、このデバイスが完全に削除する。null なら削除しない。
  trashRetentionDays: number | null;
  // PC の画面で、本文の横に目次を出すか。
  showOutline: boolean;
  // 写真を貼るときに、小さくするか。ask は貼るたびに聞く。
  imageAttachment: ImageAttachmentChoice;
  // PC の画面の、左の列の幅（px）。
  sidebarWidth: number;
  // このデバイスで、同期を自動で流すか。切っても「今すぐ同期」は使える。
  autoSync: boolean;
  // デイリーノートの題の形式と、新しく作るときに入れるノートブック（null なら、どこにも入れない）。
  dailyNoteTitleFormat: DailyNoteTitleFormat;
  dailyNoteNotebookId: string | null;
  // 打っている行を、本文の領域の中央に保つか。
  typewriterMode: boolean;
  // 自分で書いた CSS と、それを当てるか。
  customCss: string;
  customCssEnabled: boolean;
  // 期限が来たら、OS の通知で知らせるか。
  dueNotifications: boolean;
  // ウィンドウを閉じても、アプリを動かしたままにするか（Windows と Mac のアプリだけ。閉じていても期限を知らせるため）。
  stayResident: boolean;
  // 本文の列の置き場所の既定。メモごとに選んだもの（NoteContent.pageAlignment）があれば、そちらが勝つ。
  pageAlignment: PageAlignment;
  // 変えたキーボードショートカットのキー（shortcuts/shortcutOverrides.ts）。キーボードと OS がデバイスごとに違うので、同期しない。
  shortcutOverrides: ShortcutOverrides;
};

export const DEFAULT_DEVICE_PREFERENCES: DevicePreferences = {
  language: "system",
  noteSortOrder: "updatedAt",
  themeId: SYSTEM_THEME_ID,
  customThemes: [],
  editorTypography: DEFAULT_EDITOR_TYPOGRAPHY,
  checkForUpdates: true,
  trashRetentionDays: null,
  showOutline: false,
  imageAttachment: "original",
  sidebarWidth: 290,
  autoSync: true,
  dailyNoteTitleFormat: "iso",
  dailyNoteNotebookId: null,
  typewriterMode: false,
  customCss: "",
  customCssEnabled: true,
  dueNotifications: false,
  stayResident: false,
  pageAlignment: "center",
  shortcutOverrides: {},
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
    editorTypography: settledEditorTypography(candidate.editorTypography),
    checkForUpdates: typeof candidate.checkForUpdates === "boolean" ? candidate.checkForUpdates : DEFAULT_DEVICE_PREFERENCES.checkForUpdates,
    trashRetentionDays: isTrashRetentionDays(candidate.trashRetentionDays) ? candidate.trashRetentionDays : DEFAULT_DEVICE_PREFERENCES.trashRetentionDays,
    showOutline: typeof candidate.showOutline === "boolean" ? candidate.showOutline : DEFAULT_DEVICE_PREFERENCES.showOutline,
    imageAttachment: IMAGE_ATTACHMENT_CHOICES.find((choice) => choice === candidate.imageAttachment) ?? DEFAULT_DEVICE_PREFERENCES.imageAttachment,
    autoSync: typeof candidate.autoSync === "boolean" ? candidate.autoSync : DEFAULT_DEVICE_PREFERENCES.autoSync,
    dailyNoteTitleFormat: DAILY_NOTE_TITLE_FORMATS.find((format) => format === candidate.dailyNoteTitleFormat) ?? DEFAULT_DEVICE_PREFERENCES.dailyNoteTitleFormat,
    dailyNoteNotebookId: typeof candidate.dailyNoteNotebookId === "string" ? candidate.dailyNoteNotebookId : DEFAULT_DEVICE_PREFERENCES.dailyNoteNotebookId,
    typewriterMode: typeof candidate.typewriterMode === "boolean" ? candidate.typewriterMode : DEFAULT_DEVICE_PREFERENCES.typewriterMode,
    customCss: typeof candidate.customCss === "string" ? candidate.customCss : DEFAULT_DEVICE_PREFERENCES.customCss,
    customCssEnabled: typeof candidate.customCssEnabled === "boolean" ? candidate.customCssEnabled : DEFAULT_DEVICE_PREFERENCES.customCssEnabled,
    dueNotifications: typeof candidate.dueNotifications === "boolean" ? candidate.dueNotifications : DEFAULT_DEVICE_PREFERENCES.dueNotifications,
    stayResident: typeof candidate.stayResident === "boolean" ? candidate.stayResident : DEFAULT_DEVICE_PREFERENCES.stayResident,
    pageAlignment: PAGE_ALIGNMENTS.find((alignment) => alignment === candidate.pageAlignment) ?? DEFAULT_DEVICE_PREFERENCES.pageAlignment,
    sidebarWidth: clampSidebarWidth(typeof candidate.sidebarWidth === "number" ? candidate.sidebarWidth : DEFAULT_DEVICE_PREFERENCES.sidebarWidth),
    shortcutOverrides: settledShortcutOverrides(candidate.shortcutOverrides),
  };
}

// 左の列の幅の範囲（px）。狭すぎるとメモの名前が読めず、広すぎると本文が狭くなる。
export const SIDEBAR_WIDTH_RANGE = { minimum: 200, maximum: 520 } as const;

export function clampSidebarWidth(width: number): number {
  return Math.round(Math.min(SIDEBAR_WIDTH_RANGE.maximum, Math.max(SIDEBAR_WIDTH_RANGE.minimum, width)));
}

// ゴミ箱に残す日数として入力できる範囲。
export const TRASH_RETENTION_DAYS_RANGE = { minimum: 1, maximum: 3650 } as const;

export function isTrashRetentionDays(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= TRASH_RETENTION_DAYS_RANGE.minimum && value <= TRASH_RETENTION_DAYS_RANGE.maximum;
}

// 試験（Node）とプライベートウィンドウでは localStorage が無い・使えないことがある。
function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

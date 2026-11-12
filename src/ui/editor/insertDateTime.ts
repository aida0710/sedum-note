// 今の日付や日時を、カーソルの所に文字で入れる。「/」のメニューとショートカットから使う。

import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { languageInUse } from "../i18n/languageInUse";
import type { MessageKey } from "../i18n/translate";
import { formatLongDate, formatLongDateTime } from "../shared/formatTime";
import { editorKeymapName, type ShortcutKeys } from "../shared/shortcutKeys";

export type InsertedDateTime = "date" | "dateTime";

// 画面の言語の、年まで入った書き方にする（例: 2026年11月12日、November 12, 2026）。
export function currentDateTimeText(kind: InsertedDateTime, now: Date = new Date()): string {
  return kind === "dateTime" ? formatLongDateTime(now, languageInUse()) : formatLongDate(now, languageInUse());
}

export function insertCurrentDateTime(editor: Editor, kind: InsertedDateTime): boolean {
  return editor.chain().focus().insertContent(currentDateTimeText(kind)).run();
}

export const DATE_TIME_SHORTCUTS: Array<{ id: string; label: MessageKey; keys: ShortcutKeys; kind: InsertedDateTime }> = [
  { id: "insertDate", label: "editor.insertDate", keys: { key: "d", alt: true }, kind: "date" },
  { id: "insertDateTime", label: "editor.insertDateTime", keys: { key: "d", alt: true, shift: true }, kind: "dateTime" },
];

export const DateTimeShortcuts = Extension.create({
  name: "dateTimeShortcuts",
  addKeyboardShortcuts() {
    return Object.fromEntries(DATE_TIME_SHORTCUTS.map((shortcut) =>
      [editorKeymapName(shortcut.keys), () => insertCurrentDateTime(this.editor as Editor, shortcut.kind)]));
  },
});

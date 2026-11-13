// 今の日付や日時を、カーソルの所に文字で入れる。「/」のメニューとショートカットから使う。

import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { languageInUse } from "../i18n/languageInUse";
import { formatLongDate, formatLongDateTime } from "../shared/formatTime";
import { editorShortcutPlugin } from "./editorShortcutPlugin";

export type InsertedDateTime = "date" | "dateTime";

// 画面の言語の、年まで入った書き方にする（例: 2026年11月12日、November 12, 2026）。
export function currentDateTimeText(kind: InsertedDateTime, now: Date = new Date()): string {
  return kind === "dateTime" ? formatLongDateTime(now, languageInUse()) : formatLongDate(now, languageInUse());
}

export function insertCurrentDateTime(editor: Editor, kind: InsertedDateTime): boolean {
  return editor.chain().focus().insertContent(currentDateTimeText(kind)).run();
}

// キーは設定で変えられる（既定は shortcuts/shortcutCatalog.ts）。
export const DateTimeShortcuts = Extension.create({
  name: "dateTimeShortcuts",
  addProseMirrorPlugins() {
    const editor = this.editor as Editor;
    return [editorShortcutPlugin({ insertDate: () => insertCurrentDateTime(editor, "date"), insertDateTime: () => insertCurrentDateTime(editor, "dateTime") })];
  },
});

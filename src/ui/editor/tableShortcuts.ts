// 表の中で行・列を足すキーボードショートカット。表の外では何もしない（改行などの既定の動きのまま）。

import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import type { MessageKey } from "../i18n/translate";
import { editorKeymapName, type ShortcutKeys } from "../shared/shortcutKeys";

export const TABLE_SHORTCUTS: Array<{ id: string; label: MessageKey; keys: ShortcutKeys; run: (editor: Editor) => boolean }> = [
  { id: "addRowAfter", label: "editor.table.addRowAfter", keys: { key: "Enter" }, run: (editor) => editor.commands.addRowAfter() },
  { id: "addRowBefore", label: "editor.table.addRowBefore", keys: { key: "Enter", shift: true }, run: (editor) => editor.commands.addRowBefore() },
  { id: "addColumnAfter", label: "editor.table.addColumnAfter", keys: { key: "Enter", alt: true }, run: (editor) => editor.commands.addColumnAfter() },
  { id: "addColumnBefore", label: "editor.table.addColumnBefore", keys: { key: "Enter", alt: true, shift: true }, run: (editor) => editor.commands.addColumnBefore() },
];

// Ctrl+Enter は既定で改行に割り当たっているので、表の中ではこちらを先に効かせる。
const BEFORE_DEFAULT_KEYMAPS = 1000;

export const TableShortcuts = Extension.create({
  name: "tableShortcuts",
  priority: BEFORE_DEFAULT_KEYMAPS,
  addKeyboardShortcuts() {
    return Object.fromEntries(TABLE_SHORTCUTS.map((shortcut) =>
      [editorKeymapName(shortcut.keys), () => this.editor.isActive("table") && shortcut.run(this.editor as Editor)]));
  },
});

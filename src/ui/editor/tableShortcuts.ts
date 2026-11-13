// 表の中で行・列を足すキーボードショートカット（キーは設定で変えられる。既定は shortcuts/shortcutCatalog.ts）。
// 表の外では何もしない（改行などの既定の動きのまま）。

import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { editorShortcutPlugin } from "./editorShortcutPlugin";

// Ctrl+Enter は既定で改行に割り当たっているので、表の中ではこちらを先に効かせる。
const BEFORE_DEFAULT_KEYMAPS = 1000;

export const TableShortcuts = Extension.create({
  name: "tableShortcuts",
  priority: BEFORE_DEFAULT_KEYMAPS,
  addProseMirrorPlugins() {
    const editor = this.editor as Editor;
    const inTable = (run: () => boolean) => () => editor.isActive("table") && run();
    return [editorShortcutPlugin({
      addRowAfter: inTable(() => editor.commands.addRowAfter()),
      addRowBefore: inTable(() => editor.commands.addRowBefore()),
      addColumnAfter: inTable(() => editor.commands.addColumnAfter()),
      addColumnBefore: inTable(() => editor.commands.addColumnBefore()),
    })];
  },
});

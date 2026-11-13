// ブロックをキーで動かす・複製する（Notion と同じキー）。Ctrl+Shift+↑↓ で上下の隣と入れ替え、Ctrl+D ですぐ下に複製する。
// Mac では Ctrl の代わりに Command。持ち手のメニュー（BlockMenu.tsx）にも、このキーを出す。

import { type Editor, Extension } from "@tiptap/core";
import type { MessageKey } from "../i18n/translate";
import { editorKeymapName, type ShortcutKeys } from "../shared/shortcutKeys";
import { blockAtCursor, duplicateBlock, moveBlock } from "./blockOperations";

export const MOVE_BLOCK_UP_KEYS: ShortcutKeys = { key: "ArrowUp", shift: true };
export const MOVE_BLOCK_DOWN_KEYS: ShortcutKeys = { key: "ArrowDown", shift: true };
export const DUPLICATE_BLOCK_KEYS: ShortcutKeys = { key: "d" };

// 端のブロックで動かせないときも、キーは受ける（ブラウザの「行の先頭まで選ぶ」などが代わりに動かないように）。
function runOnBlockAtCursor(editor: Editor, run: (block: NonNullable<ReturnType<typeof blockAtCursor>>) => boolean): boolean {
  const block = blockAtCursor(editor.state);
  if (!block) {
    return false;
  }
  run(block);
  return true;
}

export const BLOCK_SHORTCUTS: Array<{ id: string; label: MessageKey; keys: ShortcutKeys; run: (editor: Editor) => boolean }> = [
  { id: "moveBlockUp", label: "editor.block.moveUp", keys: MOVE_BLOCK_UP_KEYS, run: (editor) => runOnBlockAtCursor(editor, (block) => moveBlock(editor, block, -1)) },
  { id: "moveBlockDown", label: "editor.block.moveDown", keys: MOVE_BLOCK_DOWN_KEYS, run: (editor) => runOnBlockAtCursor(editor, (block) => moveBlock(editor, block, 1)) },
  { id: "duplicateBlock", label: "editor.block.duplicate", keys: DUPLICATE_BLOCK_KEYS, run: (editor) => runOnBlockAtCursor(editor, (block) => duplicateBlock(editor, block)) },
];

export const BlockKeys = Extension.create({
  name: "blockKeys",
  addKeyboardShortcuts() {
    return Object.fromEntries(BLOCK_SHORTCUTS.map((shortcut) => [editorKeymapName(shortcut.keys), () => shortcut.run(this.editor)]));
  },
});

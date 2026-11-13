// ブロックをキーで動かす・複製する。既定は Notion と同じキーで、Ctrl+Shift+↑↓ で上下の隣と入れ替え、Ctrl+D ですぐ下に
// 複製する（Mac では Ctrl の代わりに Command。キーは設定で変えられる。shortcuts/shortcutCatalog.ts）。
// 持ち手のメニュー（BlockMenu.tsx）にも、このキーを出す。

import { type Editor, Extension } from "@tiptap/core";
import { blockAtCursor, duplicateBlock, moveBlock } from "./blockOperations";
import { editorShortcutPlugin } from "./editorShortcutPlugin";

// 端のブロックで動かせないときも、キーは受ける（ブラウザの「行の先頭まで選ぶ」などが代わりに動かないように）。
function runOnBlockAtCursor(editor: Editor, run: (block: NonNullable<ReturnType<typeof blockAtCursor>>) => boolean): boolean {
  const block = blockAtCursor(editor.state);
  if (!block) {
    return false;
  }
  run(block);
  return true;
}

export const BlockKeys = Extension.create({
  name: "blockKeys",
  addProseMirrorPlugins() {
    const { editor } = this;
    return [editorShortcutPlugin({
      moveBlockUp: () => runOnBlockAtCursor(editor, (block) => moveBlock(editor, block, -1)),
      moveBlockDown: () => runOnBlockAtCursor(editor, (block) => moveBlock(editor, block, 1)),
      duplicateBlock: () => runOnBlockAtCursor(editor, (block) => duplicateBlock(editor, block)),
    })];
  },
});

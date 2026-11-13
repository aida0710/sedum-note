// チェックリストの項目の中で Ctrl+Enter（Mac は ⌘+Enter）を押すと、その項目のチェックを付け外しする。
// 既定では、このキーは行の中の改行を入れる。

import { Extension } from "@tiptap/core";

const TASK_ITEM_TYPE = "taskItem";
// 改行（既定の 100）より先に見る。表の中では、行を足すキー（tableShortcuts.ts の 1000）が先。
const BEFORE_HARD_BREAK = 500;

export const TaskItemKeys = Extension.create({
  name: "taskItemKeys",
  priority: BEFORE_HARD_BREAK,
  addKeyboardShortcuts() {
    return {
      "Mod-Enter": ({ editor }) => {
        const { $from } = editor.state.selection;
        for (let depth = $from.depth; depth >= 1; depth -= 1) {
          const node = $from.node(depth);
          if (node.type.name === TASK_ITEM_TYPE) {
            editor.view.dispatch(editor.state.tr.setNodeAttribute($from.before(depth), "checked", !node.attrs.checked));
            return true;
          }
        }
        return false;
      },
    };
  },
});

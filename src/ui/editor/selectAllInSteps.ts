// コードと表のセルの中の全選択（Ctrl+A）は、1 回目でその中身だけを選び、もう 1 回で本文全体（ズーム中はズームしている所）を選ぶ。

import { Extension } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

// ズーム中の全選択（zoom.ts の 1100）より先に見る。
const BEFORE_ZOOM_SELECT_ALL = 1150;

const INNER_SELECT_ALL_TYPES = ["codeBlock", "tableCell", "tableHeader"];

// position を含む、いちばん内側のコードか表のセルの中身の範囲。
function innerSelectAllRange($position: ResolvedPos): { from: number; to: number } | null {
  for (let depth = $position.depth; depth >= 1; depth -= 1) {
    if (INNER_SELECT_ALL_TYPES.includes($position.node(depth).type.name)) {
      return { from: $position.start(depth), to: $position.end(depth) };
    }
  }
  return null;
}

export const SelectAllInSteps = Extension.create({
  name: "selectAllInSteps",
  priority: BEFORE_ZOOM_SELECT_ALL,
  addKeyboardShortcuts() {
    return {
      "Mod-a": ({ editor }) => {
        const { state } = editor;
        const range = innerSelectAllRange(state.selection.$from);
        if (!range) {
          return false;
        }
        const inner = TextSelection.between(state.doc.resolve(range.from), state.doc.resolve(range.to));
        // もう中身の全部を選んでいるか、中身より外まで選んでいるなら、全体の選択に任せる。
        if (state.selection.from <= inner.from && state.selection.to >= inner.to) {
          return false;
        }
        editor.view.dispatch(state.tr.setSelection(inner));
        return true;
      },
    };
  },
});

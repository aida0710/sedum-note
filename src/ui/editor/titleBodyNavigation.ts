// 本文の先頭から、題の欄へキーで移る（題から本文へ移る側は NoteTitleInput.tsx）。
//   ↑: 本文のいちばん上の行にカーソルがあるとき。
//   Backspace: 本文の最初の段落の先頭にカーソルがあるとき（見出し・箇条書きなどは、先に段落に戻る。順番は blockStartBackspace.ts）。
// 題の欄が出ていないとき（ズームしている間）は、moveToTitle が false を返し、キーは既定の動きのまま。

import { Extension } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";

type TitleBodyNavigationOptions = {
  // 題の欄の末尾へカーソルを移す。移したら true。
  moveToTitle: () => boolean;
};

// position が、本文の最初のブロックの、最初の文字のブロックの中か（それより上にカーソルを置ける所が無い）。
function isInFirstTextblock($position: ResolvedPos): boolean {
  for (let depth = 0; depth < $position.depth; depth += 1) {
    if ($position.index(depth) !== 0) {
      return false;
    }
  }
  return $position.parent.isTextblock;
}

export const TitleBodyNavigation = Extension.create<TitleBodyNavigationOptions>({
  name: "titleBodyNavigation",
  addOptions() {
    return { moveToTitle: () => false };
  },
  addKeyboardShortcuts() {
    const { moveToTitle } = this.options;
    return {
      ArrowUp: ({ editor }) => {
        const { selection } = editor.state;
        // 本文の先頭の、文字を打てないブロック（区切り線、写真など）を選んでいるときも、その上は題。
        if (selection instanceof NodeSelection) {
          return selection.from === 0 && moveToTitle();
        }
        return selection.empty && isInFirstTextblock(selection.$from) && editor.view.endOfTextblock("up") && moveToTitle();
      },
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        const atBodyStart = empty && $from.depth === 1 && $from.pos === 1 && $from.parent.type.name === "paragraph";
        return atBodyStart && moveToTitle();
      },
    };
  },
});

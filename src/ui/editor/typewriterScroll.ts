// タイプライターモード。カーソルのある行が、本文の領域の縦の中央に来るように送る。

import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { centerPositionInBody } from "./bodyScroll";

type TypewriterScrollOptions = {
  // 今、タイプライターモードか（設定を切り替えたら、エディタを作り直さずに効くよう、動くたびに聞く）。
  isEnabled: () => boolean;
};

export const TypewriterScroll = Extension.create<TypewriterScrollOptions>({
  name: "typewriterScroll",
  addOptions() {
    return { isEnabled: () => false };
  },
  addProseMirrorPlugins() {
    const { isEnabled } = this.options;
    return [
      new Plugin({
        view: () => ({
          update: (view, previousState) => {
            const moved = !previousState.selection.eq(view.state.selection) || !previousState.doc.eq(view.state.doc);
            if (moved && view.hasFocus() && isEnabled()) {
              centerPositionInBody(view, view.state.selection.head);
            }
          },
        }),
      }),
    ];
  },
});

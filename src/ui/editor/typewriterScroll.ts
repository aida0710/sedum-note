// タイプライターモード。カーソルのある行が、本文の領域の縦の中央に来るように送る。

import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

type TypewriterScrollOptions = {
  // 今、タイプライターモードか（設定を切り替えたら、エディタを作り直さずに効くよう、動くたびに聞く）。
  isEnabled: () => boolean;
  // 本文を縦に送る要素（エディタの外側）のセレクター。
  scrollContainerSelector: string;
};

export const TypewriterScroll = Extension.create<TypewriterScrollOptions>({
  name: "typewriterScroll",
  addOptions() {
    return { isEnabled: () => false, scrollContainerSelector: "" };
  },
  addProseMirrorPlugins() {
    const { isEnabled, scrollContainerSelector } = this.options;
    return [
      new Plugin({
        view: () => ({
          update: (view, previousState) => {
            const moved = !previousState.selection.eq(view.state.selection) || !previousState.doc.eq(view.state.doc);
            const scrollContainer = view.dom.closest(scrollContainerSelector);
            if (!moved || !view.hasFocus() || !isEnabled() || !scrollContainer) {
              return;
            }
            const caret = view.coordsAtPos(view.state.selection.head);
            const visibleArea = scrollContainer.getBoundingClientRect();
            scrollContainer.scrollTop += (caret.top + caret.bottom) / 2 - (visibleArea.top + visibleArea.height / 2);
          },
        }),
      }),
    ];
  },
});

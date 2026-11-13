// タブを切り替えて戻ったときに、本文のスクロール位置とカーソルの位置を元に戻す。
// タブを切り替えるたびにエディタは作り直されるので、メモごとの位置をここに覚えておく（アプリを閉じるまで。保存はしない）。

import type { Editor } from "@tiptap/react";
import { type RefObject, useEffect } from "react";

type RememberedView = { scrollTop: number; anchor: number; head: number };

const rememberedViews = new Map<string, RememberedView>();

type RememberedNoteViewInput = {
  noteId: string;
  editor: Editor | null;
  scrollContainer: RefObject<HTMLElement | null>;
  // リンクから特定のブロックへ送られて開いたときは、そちらの位置を優先して戻さない。
  skipRestore: boolean;
};

export function useRememberedNoteView({ noteId, editor, scrollContainer, skipRestore }: RememberedNoteViewInput): void {
  useEffect(() => {
    const container = scrollContainer.current;
    if (!editor || !container) {
      return;
    }
    const remembered = rememberedViews.get(noteId);
    // 開いてすぐ利用者が本文を押していたら（エディタにもうフォーカスがあれば）、その位置を優先して戻さない。
    const userAlreadyInBody = editor.view.hasFocus();
    if (remembered && !skipRestore && !userAlreadyInBody) {
      // 覚えた位置が、ほかのデバイスの編集で本文の外になっていることがあるので、本文の中に収める。
      const size = editor.state.doc.content.size;
      const within = (position: number) => Math.min(Math.max(position, 1), size);
      editor.commands.setTextSelection({ from: within(remembered.anchor), to: within(remembered.head) });
      // 戻ってきたら、続けて打てるよう、本文にカーソルを置く。
      editor.view.focus();
      // 本文が描かれてから、スクロールを戻す（フォーカスで動いた分も、覚えた位置に戻す）。
      requestAnimationFrame(() => { container.scrollTop = remembered.scrollTop; });
    }
    const remember = () => {
      const { anchor, head } = editor.state.selection;
      rememberedViews.set(noteId, { scrollTop: container.scrollTop, anchor, head });
    };
    container.addEventListener("scroll", remember, { passive: true });
    editor.on("selectionUpdate", remember);
    return () => {
      container.removeEventListener("scroll", remember);
      editor.off("selectionUpdate", remember);
    };
    // 開いたとき（エディタを作ったとき）だけ戻す。skipRestore は、そのときの値だけを見る。
  }, [editor, noteId]);
}

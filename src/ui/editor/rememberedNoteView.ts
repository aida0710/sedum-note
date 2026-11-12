// タブを切り替えて戻ったときに、本文のスクロール位置とカーソルの位置を元に戻す。
// タブを切り替えるたびにエディタは作り直されるので、メモごとの位置をここに覚えておく（アプリを閉じるまで。保存はしない）。

import type { Editor } from "@tiptap/react";
import { type RefObject, useEffect, useRef } from "react";

type RememberedView = { scrollTop: number; anchor: number; head: number };

const rememberedViews = new Map<string, RememberedView>();

type RememberedNoteViewInput = {
  noteId: string;
  editor: Editor | null;
  scrollContainer: RefObject<HTMLElement | null>;
  // リンクから特定のブロックへ送られて開いたときは、そちらの位置を優先して戻さない。
  skipRestore: boolean;
  // アウトライン表示か。切り替えるとエディタが作り直されるが、そのときは戻さない
  // （本文の形が変わって覚えた位置がずれるうえ、利用者が置いたカーソルを動かしてしまう）。
  isOutline: boolean;
};

export function useRememberedNoteView({ noteId, editor, scrollContainer, skipRestore, isOutline }: RememberedNoteViewInput): void {
  // 前のエディタを作ったときのアウトライン表示（まだ作っていなければ null）。
  const outlineOfPreviousEditor = useRef<boolean | null>(null);
  useEffect(() => {
    const container = scrollContainer.current;
    if (!editor || !container) {
      return;
    }
    const switchedOutline = outlineOfPreviousEditor.current !== null && outlineOfPreviousEditor.current !== isOutline;
    outlineOfPreviousEditor.current = isOutline;
    const remembered = rememberedViews.get(noteId);
    if (remembered && !skipRestore && !switchedOutline) {
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
    // 開いたとき（エディタを作ったとき）だけ戻す。skipRestore と isOutline は、そのときの値だけを見る。
  }, [editor, noteId]);
}

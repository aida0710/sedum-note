// スマホでメモを開いている間、端末の「戻る」（ボタン・ジェスチャー）でアプリを閉じず、
// 一覧へ戻す。開いたときに履歴を 1 つ積み、戻るでそれが外れたら閉じる（積み方の決まりは shared/backHistory.ts）。
// 重ねて開く画面（ノートブックの中の一覧や期限の一覧から開いたメモ）は、下の画面が積んだ履歴をそのまま使う。
// 下の画面は、上の画面が閉じて戻ってきたときに積み直す。こうすると、使われない履歴が残って「戻る」が空振りすることがない。

import { useEffect, useRef } from "react";
import { isBackEntryOnTop, isOwnHistoryTraversal, pushBackEntry, removeBackEntry } from "../shared/backHistory";

const SCREEN_BACK_ENTRY_OWNER = "sedum-note-open-note";

export function useBackGestureToClose(isOpen: boolean, close: () => void): () => void {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    pushBackEntry(SCREEN_BACK_ENTRY_OWNER);
    const closeOnBack = () => {
      // 外れたのが上に重ねたダイアログの履歴か、アプリが履歴を片付けるために戻したのなら、この画面は閉じない。
      if (!isOwnHistoryTraversal() && !isBackEntryOnTop(SCREEN_BACK_ENTRY_OWNER)) {
        closeRef.current();
      }
    };
    window.addEventListener("popstate", closeOnBack);
    return () => window.removeEventListener("popstate", closeOnBack);
  }, [isOpen]);

  // 画面の「戻る」で閉じたときは、積んだ履歴も外す（上にダイアログやメニューの履歴があれば、それも一緒に閉じるので外れる）。
  return () => {
    removeBackEntry(SCREEN_BACK_ENTRY_OWNER);
    closeRef.current();
  };
}

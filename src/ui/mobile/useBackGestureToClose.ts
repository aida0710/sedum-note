// スマホでメモを開いている間、端末の「戻る」（ボタン・ジェスチャー）でアプリを閉じず、
// 一覧へ戻す。開いたときに履歴を 1 つ積み、戻るでそれが外れたら閉じる。
// 重ねて開く画面（ノートブックの中の一覧や期限の一覧から開いたメモ）は、下の画面が積んだ履歴をそのまま使う。
// 下の画面は、上の画面が閉じて戻ってきたときに積み直す。こうすると、使われない履歴が残って「戻る」が空振りすることがない。

import { useEffect, useRef } from "react";

const HISTORY_MARK = "sedum-note-open-note";

function isBackGestureHistoryOnTop(): boolean {
  return (window.history.state as { mark?: string } | null)?.mark === HISTORY_MARK;
}

export function useBackGestureToClose(isOpen: boolean, close: () => void): () => void {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (!isBackGestureHistoryOnTop()) {
      window.history.pushState({ mark: HISTORY_MARK }, "");
    }
    const closeOnBack = () => closeRef.current();
    window.addEventListener("popstate", closeOnBack);
    return () => window.removeEventListener("popstate", closeOnBack);
  }, [isOpen]);

  // 画面の「戻る」も履歴を外す形にそろえ、積んだ履歴を残さない。
  return () => {
    if (isBackGestureHistoryOnTop()) {
      window.history.back();
    } else {
      closeRef.current();
    }
  };
}

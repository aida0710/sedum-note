// スマホでメモを開いている間、端末の「戻る」（ボタン・ジェスチャー）でアプリを閉じず、
// 一覧へ戻す。開いたときに履歴を 1 つ積み、戻るでそれが外れたら閉じる。

import { useEffect, useRef } from "react";

const HISTORY_MARK = "memo-app-open-note";

export function useBackGestureToClose(isOpen: boolean, close: () => void): () => void {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    window.history.pushState({ mark: HISTORY_MARK }, "");
    const closeOnBack = () => closeRef.current();
    window.addEventListener("popstate", closeOnBack);
    return () => window.removeEventListener("popstate", closeOnBack);
  }, [isOpen]);

  // 画面の「戻る」も履歴を外す形にそろえ、積んだ履歴を残さない。
  return () => {
    if ((window.history.state as { mark?: string } | null)?.mark === HISTORY_MARK) {
      window.history.back();
    } else {
      closeRef.current();
    }
  };
}

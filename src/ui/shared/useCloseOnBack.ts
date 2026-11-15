// スマホの組み方では、ダイアログやメニューを開いている間に端末の「戻る」を押したら、下の画面ではなく、それだけを閉じる。
// 開いたときに履歴を 1 つ積み、「戻る」でそれが外れたら閉じる。ボタンや Escape で閉じたときは、積んだ履歴を外す。

import { type RefObject, useEffect, useId, useRef } from "react";
import { isBackEntryOnTop, isOwnHistoryTraversal, pushBackEntry, removeBackEntry } from "./backHistory";
import { MOBILE_LAYOUT_QUERY } from "./useMediaQuery";

// elementRef は、閉じる画面の要素（ダイアログの枠、メニュー）。
export function useCloseOnBack({ elementRef, onClose }: { elementRef: RefObject<HTMLElement | null>; onClose: () => void }): void {
  const owner = `sedum-note-overlay-${useId()}`;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    // PC の組み方には「戻る」で閉じる画面が無いので、ブラウザの履歴を増やさない。
    if (!window.matchMedia(MOBILE_LAYOUT_QUERY).matches) {
      return;
    }
    pushBackEntry(owner);
    const closeOnBack = () => {
      if (!isOwnHistoryTraversal() && !isBackEntryOnTop(owner)) {
        onCloseRef.current();
      }
    };
    window.addEventListener("popstate", closeOnBack);
    const element = elementRef.current;
    return () => {
      window.removeEventListener("popstate", closeOnBack);
      // 開発時の StrictMode は、閉じていないのに後始末を 1 度走らせる。画面に残っていれば、履歴を外さない。
      if (!element?.isConnected) {
        removeBackEntry(owner);
      }
    };
  }, [owner, elementRef]);
}

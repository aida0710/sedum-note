// スマホの一覧のスクロール位置を、一覧ごとに覚えておき、メモを開いて戻ったときに元の位置から続けて読めるようにする。
// メモを開いている間、一覧は画面から外れて作り直されるので、位置をここに持つ（アプリを閉じるまで。保存はしない）。

import { type RefObject, useLayoutEffect } from "react";

const rememberedScrollTops = new Map<string, number>();

// listKey は、どの一覧か（下のタブと、開いているノートブック・タグなど）を表す文字。
export function useRememberedListScroll(scrollContainer: RefObject<HTMLElement | null>, listKey: string): void {
  // 描く前に戻す（先頭が一瞬見えてから動くのを防ぐ）。
  useLayoutEffect(() => {
    const container = scrollContainer.current;
    if (!container) {
      return;
    }
    container.scrollTop = rememberedScrollTops.get(listKey) ?? 0;
    const remember = () => rememberedScrollTops.set(listKey, container.scrollTop);
    container.addEventListener("scroll", remember, { passive: true });
    return () => container.removeEventListener("scroll", remember);
  }, [scrollContainer, listKey]);
}

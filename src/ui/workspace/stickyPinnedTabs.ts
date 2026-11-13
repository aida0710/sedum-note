// ピン留めしたタブを、タブの並びを横に送っても左端に留める（CSS の position: sticky）。ピン留めしたタブは並びの先頭に
// まとまっている（tabState.ts）ので、それぞれを並べた位置のまま留めるよう、左からの位置（left）を幅から測って入れる。
// 並びを送ったときに、ピン留めしていないタブの続きが左にあることは、ピン留めの最後のタブの影で見せる（app.css）。

import { type RefObject, useLayoutEffect } from "react";

const PINNED_TAB_SELECTOR = ".tab.pinned";

export function useStickyPinnedTabs(strip: RefObject<HTMLElement | null>): void {
  // タブの題が変わると幅も変わるので、描くたびに測り直す（ピン留めのタブは数個なので、測る手間は小さい）。
  useLayoutEffect(() => {
    const element = strip.current;
    if (!element) {
      return;
    }
    // sticky の left は、並びの内側の余白（padding）の内側から測る。最初のタブは 0 で、並べた位置のまま留まる。
    const gap = parseFloat(getComputedStyle(element).columnGap);
    let left = 0;
    for (const tab of element.querySelectorAll<HTMLElement>(PINNED_TAB_SELECTOR)) {
      tab.style.left = `${left}px`;
      left += tab.offsetWidth + gap;
    }
  });
}

// ピン留めのタブの並びの右端に、タブの間の幅を足した位置（画面の座標）。ピン留めのタブが無ければ null。
// ほかのタブを見える所まで送るときに、ピン留めのタブの下に隠れず、間も空く位置を求めるのに使う。
export function pinnedTabsRightEdge(strip: HTMLElement): number | null {
  const pinnedTabs = strip.querySelectorAll<HTMLElement>(PINNED_TAB_SELECTOR);
  const last = pinnedTabs[pinnedTabs.length - 1];
  return last ? last.getBoundingClientRect().right + parseFloat(getComputedStyle(strip).columnGap) : null;
}

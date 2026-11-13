// 横に送れる帯（スマホの下のツールバーなど）に、まだ先があるかを data 属性で付ける。
// CSS が、先がある側の端をぼかして「横に送れる」ことを見せるのに使う（data-more-start・data-more-end）。

import { type RefObject, useEffect, useRef } from "react";

// 端まで送ったかを見るときの遊び。拡大した画面では scrollLeft が小数になり、端でもぴったり一致しない。
const EDGE_TOLERANCE_PIXELS = 1;

export function useHorizontalScrollEdges<ScrollElement extends HTMLElement>(): RefObject<ScrollElement | null> {
  const scrollElement = useRef<ScrollElement>(null);
  useEffect(() => {
    const element = scrollElement.current;
    if (!element) {
      return;
    }
    const markEdges = () => {
      const hiddenAtEnd = element.scrollWidth - element.clientWidth - element.scrollLeft;
      element.toggleAttribute("data-more-start", element.scrollLeft > EDGE_TOLERANCE_PIXELS);
      element.toggleAttribute("data-more-end", hiddenAtEnd > EDGE_TOLERANCE_PIXELS);
    };
    markEdges();
    element.addEventListener("scroll", markEdges, { passive: true });
    // 帯の幅と、中のボタンの数（箇条書きの中でだけ出るボタンなど）が変わったときも見直す。
    const resizeObserver = new ResizeObserver(markEdges);
    resizeObserver.observe(element);
    const mutationObserver = new MutationObserver(markEdges);
    mutationObserver.observe(element, { childList: true });
    return () => {
      element.removeEventListener("scroll", markEdges);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);
  return scrollElement;
}

// 本文の欄（.document-scroll）が狭いか。AI チャット・目次・右に並べたメモを開いて欄が狭くなると、本文の左右の余白（84px ずつ）が
// 文字の幅を削り、1 行が十数文字になっていた。狭いときは、持ち手の無い右の余白を詰める（app.css の .narrow-body）。
// 左の余白には、持ち手・「＋」・見出しのズームのボタンが入るので詰めない。

import { type RefObject, useEffect, useState } from "react";

// これより狭い欄で詰める。余白をそのままにすると、文字の幅が 432px（本文 16px で全角 27 文字）を切る。
const NARROW_BODY_MAX_WIDTH = 600;

export function useNarrowBody(scrollContainer: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const element = scrollContainer.current;
    if (!enabled || !element) {
      setNarrow(false);
      return undefined;
    }
    const observer = new ResizeObserver(() => setNarrow(element.clientWidth < NARROW_BODY_MAX_WIDTH));
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollContainer, enabled]);
  return narrow;
}

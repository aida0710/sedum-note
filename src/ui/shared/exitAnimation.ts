// 消える部品（ダイアログ、知らせ）の、消えるときの動き。
// 部品は呼び出し側の都合ですぐ外れる（閉じた時点で、フォーカスも戻る）。外れる直前に、見た目だけの写しを同じ所に残して
// CSS の .leaving の動き（app.css。透明へ消える）を流し、動きが終わったら写しを外す。写しは操作を受けない（inert）。
// 動きを減らす設定のときと、動かさない部品（コマンドパレット）は、写しの動きが無いので、すぐ外す。

import { type RefObject, useLayoutEffect } from "react";

// 写しに付けるクラス。app.css が、このクラスの部品に消える動きを付ける。
const LEAVING_CLASS = "leaving";
const MEDIA_SELECTOR = "iframe, video, audio";

// 写しを見た目だけの絵にする。役割（role="dialog" など）・aria・id を外す。残すと、開いているダイアログを探す所
// （ショートカットや Esc を止める判定）が写しを数え、閉じたあとの 0.1 秒、キーが効かなかった。id は本物と重なる。
function stripSemantics(copy: HTMLElement): void {
  for (const element of [copy, ...copy.querySelectorAll<HTMLElement>("*")]) {
    element.removeAttribute("id");
    element.removeAttribute("role");
    for (const name of element.getAttributeNames().filter((attribute) => attribute.startsWith("aria-"))) {
      element.removeAttribute(name);
    }
  }
}

function leaveWithAnimation(element: HTMLElement): void {
  const copy = element.cloneNode(true) as HTMLElement;
  copy.classList.add(LEAVING_CLASS);
  stripSemantics(copy);
  copy.inert = true;
  copy.setAttribute("aria-hidden", "true");
  // 写しの中の埋め込み・動画・音声は外す（写すと、外のページを読み込み直したり、音を鳴らし直したりするため）。
  copy.querySelectorAll(MEDIA_SELECTOR).forEach((media) => media.remove());
  element.after(copy);
  if (getComputedStyle(copy).animationName === "none") {
    copy.remove();
    return;
  }
  const removeCopy = (event: AnimationEvent) => {
    if (event.target === copy) {
      copy.remove();
    }
  };
  copy.addEventListener("animationend", removeCopy);
  copy.addEventListener("animationcancel", removeCopy);
  // 開発時の StrictMode は、外していないのに後始末を 1 度走らせる。React がこの直後に部品を外さなかったら、写しを捨てる。
  queueMicrotask(() => {
    if (element.isConnected) {
      copy.remove();
    }
  });
}

// ref の部品が外れるときに、消える動きを付ける。
export function useExitAnimation(ref: RefObject<HTMLElement | null>): void {
  // 後始末は、React が部品を外す前に走る layout の後始末で行う（外したあとでは、写す元が無い）。
  useLayoutEffect(() => {
    const element = ref.current;
    return () => {
      if (element?.isConnected) {
        leaveWithAnimation(element);
      }
    };
  }, [ref]);
}

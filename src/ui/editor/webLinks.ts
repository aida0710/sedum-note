// 本文の Web のリンク（link の書式）を、外のブラウザで開くときの決まり。

import { openableWebLinkUrl } from "../shared/openableWebLinkUrl";

// Ctrl（Mac は ⌘）を押しながら本文のリンクを押したなら、そのリンク先。ふつうに押したときは、リンクの文字の中にカーソルを置くだけ。
export function webLinkUrlAtModifierClick(event: { ctrlKey: boolean; metaKey: boolean; target: EventTarget }): string | null {
  if (!(event.ctrlKey || event.metaKey) || !(event.target instanceof Element)) {
    return null;
  }
  const href = event.target.closest(".ProseMirror a[href]")?.getAttribute("href");
  return href ? openableWebLinkUrl(href) : null;
}

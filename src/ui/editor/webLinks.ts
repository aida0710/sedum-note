// 本文の Web のリンク（link の書式）を、外のブラウザで開くときの決まり。

// 開いてよいリンク先の種類。本文には貼り付けや取り込みで何でも入るので、Web のページとメールだけにする
// （javascript: や file: などは開かない）。
const OPENABLE_PROTOCOLS = ["http:", "https:", "mailto:"];

// 開いてよいリンク先なら、その URL。そうでなければ null。
export function openableWebLinkUrl(href: string): string | null {
  try {
    const url = new URL(href);
    return OPENABLE_PROTOCOLS.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

// Ctrl（Mac は ⌘）を押しながら本文のリンクを押したなら、そのリンク先。ふつうに押したときは、リンクの文字の中にカーソルを置くだけ。
export function webLinkUrlAtModifierClick(event: { ctrlKey: boolean; metaKey: boolean; target: EventTarget }): string | null {
  if (!(event.ctrlKey || event.metaKey) || !(event.target instanceof Element)) {
    return null;
  }
  const href = event.target.closest(".ProseMirror a[href]")?.getAttribute("href");
  return href ? openableWebLinkUrl(href) : null;
}

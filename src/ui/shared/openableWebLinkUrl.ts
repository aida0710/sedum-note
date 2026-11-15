// 外のブラウザで開いてよいリンク先かを決める。本文（貼り付けや取り込みで何でも入る）と AI のチャットの答え（AI が読んだ
// メモの文に何を書かれていてもよい）のリンクで使う。

// 開いてよいリンク先の種類。Web のページとメールだけにする（javascript: や file: などは開かない）。
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

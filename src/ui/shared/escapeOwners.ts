// Esc で「1 つ戻る」操作（ズームから戻る、フォーカスモードを終わる）が、Esc を使ってよいか。
// 開いているメニュー・ダイアログ・入力欄の Esc は、それぞれを閉じる・やめるのに使うので、戻る操作には使わない。

// Esc をそちらに任せる所（入力欄、ダイアログ、メモの中の検索の欄、AI チャットの欄）。AI チャットの欄の Esc は、欄を閉じるのに使う。
const OWN_ESCAPE_SELECTOR = 'input, textarea, select, [role="dialog"], .find-bar, .ai-chat';

// 開いているメニュー（「…」、「/」の候補、文字を選んだときの色の見本など）があるか。あれば、Esc はそのメニューを閉じる（PopupMenu.tsx）。
export function isMenuOpen(): boolean {
  return document.querySelector(".menu") !== null;
}

// target の Esc を、入力欄・ダイアログ・メニューが使うか。
export function isEscapeOwnedElsewhere(target: Element | null): boolean {
  return target?.closest(OWN_ESCAPE_SELECTOR) != null || isMenuOpen();
}

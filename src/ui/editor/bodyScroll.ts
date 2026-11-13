// 本文を縦に送る。カーソルと、見せたい位置（メモの中の検索の当たりなど）が、窓の端に張り付かないようにする。

import type { EditorView } from "@tiptap/pm/view";

// 本文を縦に送る要素（エディタの外側）。
export const BODY_SCROLL_CONTAINER_SELECTOR = ".document-scroll";

type ScrollMargin = { top: number; bottom: number; left: number; right: number };

// 打っているカーソルと、本文の枠の上下の端との間に空ける幅（px）。既定の 5px では、長いメモの末尾で打つ行が窓の下の端に付く。
// 下は次の数行が見えるよう約 5 行ぶん、上は約 2 行半ぶん。
export const CARET_SCROLL_MARGIN: ScrollMargin = { top: 80, bottom: 160, left: 0, right: 0 };
// スマホは、キーボードが出ると本文の枠が 300px ほどになる。上下の合計が枠の高さを超えないよう、半分にする。
export const CARET_SCROLL_MARGIN_ON_PHONE: ScrollMargin = { top: 40, bottom: 80, left: 0, right: 0 };

function bodyScrollContainer(view: EditorView): Element | null {
  return view.dom.closest(BODY_SCROLL_CONTAINER_SELECTOR);
}

// position の行が、本文の枠の縦の中央に来るように送る。
export function centerPositionInBody(view: EditorView, position: number): void {
  const scrollContainer = bodyScrollContainer(view);
  if (!scrollContainer) {
    return;
  }
  const line = view.coordsAtPos(position);
  const visibleArea = scrollContainer.getBoundingClientRect();
  scrollContainer.scrollTop += (line.top + line.bottom) / 2 - (visibleArea.top + visibleArea.height / 2);
}

// position の行が、本文の枠の端の近くか外にあるときだけ、中央へ送る。もう見えている行は動かさない。
export function revealPositionInBody(view: EditorView, position: number): void {
  const scrollContainer = bodyScrollContainer(view);
  if (!scrollContainer) {
    return;
  }
  const line = view.coordsAtPos(position);
  const visibleArea = scrollContainer.getBoundingClientRect();
  const isComfortablyVisible = line.top >= visibleArea.top + CARET_SCROLL_MARGIN.top && line.bottom <= visibleArea.bottom - CARET_SCROLL_MARGIN.bottom;
  if (!isComfortablyVisible) {
    centerPositionInBody(view, position);
  }
}

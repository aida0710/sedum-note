// 本文のまわりの空いた所（本文の下の余白と、左右の余白）を押したときに、本文へカーソルを入れる。
// 何もしないと、フォーカスが本文から外れて、続けて打った文字がどこにも入らない。
//   本文より下: 本文の末尾へ。
//   本文の左右: 同じ高さの行の、先頭（左）か末尾（右）へ。

import { Selection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

type BlankAreaPress = { button: number; clientX: number; clientY: number; target: EventTarget; currentTarget: HTMLElement };

// 押した所が、本文を縦に送る枠か本文の列そのもの（どちらも余白）か。題・プロパティ・バックリンクなどの上と、スクロールバーの上は除く。
function isBlankArea({ target, currentTarget, clientX }: BlankAreaPress): boolean {
  const isMargin = target === currentTarget || (target instanceof Element && target.parentElement === currentTarget);
  const scrollbarLeft = currentTarget.getBoundingClientRect().left + currentTarget.clientWidth;
  return isMargin && clientX < scrollbarLeft;
}

// 余白を押したなら、本文へカーソルを入れて true を返す（呼ぶ側で、ブラウザの既定の動きを止める）。
// scrollArea の mousedown から呼ぶ（press.currentTarget が、本文を縦に送る枠）。
export function placeCursorFromBlankArea(view: EditorView, press: BlankAreaPress): boolean {
  const isPrimaryButton = press.button === 0;
  if (!isPrimaryButton || !view.editable || !isBlankArea(press)) {
    return false;
  }
  const bodyBox = view.dom.getBoundingClientRect();
  // 本文より上（題のまわりの余白）は、何もしない。
  if (press.clientY < bodyBox.top) {
    return false;
  }
  const { doc } = view.state;
  let selection = Selection.atEnd(doc);
  if (press.clientY <= bodyBox.bottom) {
    // 横は本文の中に寄せて、同じ高さの行を探す。
    const left = Math.min(Math.max(press.clientX, bodyBox.left + 1), bodyBox.right - 1);
    const found = view.posAtCoords({ left, top: press.clientY });
    selection = found ? Selection.near(doc.resolve(found.pos), press.clientX < bodyBox.left ? 1 : -1) : selection;
  }
  view.dispatch(view.state.tr.setSelection(selection));
  view.focus();
  return true;
}

// ダイアログを閉じたときに、フォーカスを開く前の要素へ戻す。
//
// 本文のエディタは、DOM の focus() だけで戻すと、ブラウザがカーソルを本文の先頭に置き、エディタがそれを読み取ることがある
// （閉じたあとに打った文字が本文の先頭に入る）。そういう要素は、自分の戻し方（エディタのカーソルの位置ごと戻す）を登録しておく。

const focusRestorers = new WeakMap<Element, () => void>();

// element へフォーカスを戻すときに、focus() の代わりに restoreFocus を呼ぶ。返した関数で登録を外す。
export function registerFocusRestorer(element: Element, restoreFocus: () => void): () => void {
  focusRestorers.set(element, restoreFocus);
  return () => {
    focusRestorers.delete(element);
  };
}

export function returnFocusTo(element: HTMLElement): void {
  const restoreFocus = focusRestorers.get(element);
  if (restoreFocus) {
    restoreFocus();
  } else {
    element.focus();
  }
}

// 端末の「戻る」（Android のボタン・ジェスチャー、ブラウザの戻る）で閉じる画面が積む、ブラウザの履歴の決まり。
// 積んだ履歴には持ち主の名前を入れる。「戻る」で履歴が 1 つ外れたとき、自分の名前がまだいちばん上にあれば、
// 外れたのは上に重ねた画面（ダイアログ）の履歴なので、自分は閉じない。

type BackEntryState = { backEntryOwner?: string };

export function isBackEntryOnTop(owner: string): boolean {
  return (window.history.state as BackEntryState | null)?.backEntryOwner === owner;
}

// いちばん上が自分の履歴でなければ積む（同じ持ち主の画面が続けて開いても、履歴は 1 つにする）。
export function pushBackEntry(owner: string): void {
  if (!isBackEntryOnTop(owner)) {
    window.history.pushState({ backEntryOwner: owner } satisfies BackEntryState, "");
  }
}

// 画面の中のボタンで閉じたときに、積んだ履歴を外す（残すと、次の「戻る」が 1 回空振りする）。
export function removeBackEntry(owner: string): void {
  if (isBackEntryOnTop(owner)) {
    window.history.back();
  }
}

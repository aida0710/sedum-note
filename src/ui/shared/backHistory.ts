// 端末の「戻る」（Android のボタン・ジェスチャー、ブラウザの戻る）で閉じる画面が積む、ブラウザの履歴の決まり。
// 積んだ履歴には持ち主の名前と、その下に積んである持ち主の並びを入れる。「戻る」で履歴が 1 つ外れたとき、
// 自分の名前がまだいちばん上にあれば、外れたのは上に重ねた画面（ダイアログ・メニュー）の履歴なので、自分は閉じない。
//
// 積む・外すは、すぐには行わず、同じ描画の中の分をまとめてから行う。メニューの項目でダイアログを開く、AI チャットの
// ボタンでチャットとメモを閉じて設定を開く、のように、閉じるのと開くのが同時に起きるため（history.back() は後から効くので、
// 1 つずつ行うと、外す前に積んだ履歴の方が外れる）。

type BackEntryState = { backEntryOwner: string; backEntryOwners: string[] };
type HistoryChange = { kind: "push" | "remove"; owner: string };

const pendingChanges: HistoryChange[] = [];
let isFlushScheduled = false;
// アプリが自分で戻している最中か（history.go の結果の popstate を待っている）。
let isWaitingForOwnTraversal = false;
// いま届いた popstate が、アプリが自分で戻したものか。画面は、これを利用者の「戻る」として扱わない。
let isLastPopOwnTraversal = false;

// 積んである持ち主の並び（下から上）。
function ownersOnHistory(): string[] {
  return (window.history.state as Partial<BackEntryState> | null)?.backEntryOwners ?? [];
}

export function isBackEntryOnTop(owner: string): boolean {
  return ownersOnHistory().at(-1) === owner;
}

// いま届いた popstate が、アプリが履歴を片付けるために戻したものなら true。利用者の「戻る」ではないので、画面を閉じない。
export function isOwnHistoryTraversal(): boolean {
  return isLastPopOwnTraversal;
}

// 自分の履歴を積む。いちばん上が自分なら積まない（同じ持ち主の画面が続けて開いても、履歴は 1 つにする）。
export function pushBackEntry(owner: string): void {
  pendingChanges.push({ kind: "push", owner });
  scheduleFlush();
}

// 画面の中のボタンで閉じたときに、積んだ履歴を外す（残すと、次の「戻る」が 1 回空振りする）。上に別の画面の履歴が
// 積んであっても外す（上の画面も同時に閉じるとき）。
export function removeBackEntry(owner: string): void {
  pendingChanges.push({ kind: "remove", owner });
  scheduleFlush();
}

function scheduleFlush(): void {
  if (isFlushScheduled) {
    return;
  }
  isFlushScheduled = true;
  queueMicrotask(() => {
    isFlushScheduled = false;
    flush();
  });
}

// たまった変更を当てた、あるべき並びにする。戻る数が要れば戻り、戻り終えてから残りを積む。
function flush(): void {
  if (isWaitingForOwnTraversal || pendingChanges.length === 0) {
    return;
  }
  const current = ownersOnHistory();
  const wanted = [...current];
  for (const change of pendingChanges.splice(0)) {
    if (change.kind === "remove") {
      const index = wanted.lastIndexOf(change.owner);
      if (index >= 0) {
        wanted.splice(index, 1);
      }
    } else if (wanted.at(-1) !== change.owner) {
      wanted.push(change.owner);
    }
  }
  let kept = 0;
  while (kept < current.length && kept < wanted.length && current[kept] === wanted[kept]) {
    kept += 1;
  }
  const toPush = wanted.slice(kept);
  if (current.length > kept) {
    // 戻り終えたら（popstate）、残りを積み直す。
    pendingChanges.unshift(...toPush.map((owner): HistoryChange => ({ kind: "push", owner })));
    isWaitingForOwnTraversal = true;
    window.history.go(kept - current.length);
    return;
  }
  for (const owner of toPush) {
    const state: BackEntryState = { backEntryOwner: owner, backEntryOwners: [...ownersOnHistory(), owner] };
    window.history.pushState(state, "");
  }
}

// 画面の popstate の受け手より先に登録して、アプリが自分で戻したものかを先に決める。
// window の無い所（Node で流す単体の試験が、このファイルを間接に読み込むとき）では登録しない。
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    isLastPopOwnTraversal = isWaitingForOwnTraversal;
    if (isWaitingForOwnTraversal) {
      isWaitingForOwnTraversal = false;
      flush();
    }
  });
}

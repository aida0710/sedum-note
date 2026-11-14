// Web Locks の、ウィンドウ（Web 版ならタブ）をまたいで持ち続けるロック。持っている間は、ほかのウィンドウの
// navigator.locks.query() にも見える。ウィンドウを閉じたり読み込み直したりすると、ブラウザが手放す。

// Web Locks のある環境か（古い WebView には無い）。
export function hasWebLocks(): boolean {
  return typeof navigator !== "undefined" && "locks" in navigator;
}

type HeldLockOptions = {
  // exclusive は 1 つのウィンドウだけが持てる（順番待ちになる）。shared は何個のウィンドウでも同時に持てる。
  mode: LockMode;
  // 取れたときに呼ぶ。
  onAcquired?: () => void;
};

// name のロックを取って、返した関数を呼ぶまで持ち続ける。取れる前に呼んだら、取らずにやめる（onAcquired も呼ばない）。
// Web Locks のある環境だけで呼ぶ。
export function holdWebLock(name: string, { mode, onAcquired }: HeldLockOptions): () => void {
  let released = false;
  let release: () => void = () => undefined;
  navigator.locks.request(name, { mode }, () => new Promise<void>((resolve) => {
    if (released) {
      resolve();
      return;
    }
    release = resolve;
    onAcquired?.();
  // 順番待ちは、ブラウザがこのサイトのデータを消すとき（ウィンドウを閉じる途中など）に、失敗で打ち切られる。
  // そのときは、このウィンドウの保存も一緒に無くなっているので、続きの処理は無い。
  })).catch(() => undefined);
  return () => {
    released = true;
    release();
  };
}

// name のロックを、どこかのウィンドウ（自分も含む）が持っているか。Web Locks のある環境だけで呼ぶ。
export async function isWebLockHeld(name: string): Promise<boolean> {
  const { held = [] } = await navigator.locks.query();
  return held.some((lock) => lock.name === name);
}

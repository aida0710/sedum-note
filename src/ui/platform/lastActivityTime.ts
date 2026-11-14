// 最後に操作した時刻（1970 年からのミリ秒）を、このアプリの全部のウィンドウ（Web 版なら全部のタブ）で共有する。
// 操作が無いときの自動のロック（session/inactivityLock.ts）が、ほかのウィンドウの操作も数えるのに使う。
// 時刻だけでメモの中身ではないので、暗号化せずに localStorage に置く。

// Web 版はほかのページと同じ出どころ（github.io）に載るので、キーにアプリの名前を付ける。
const STORAGE_KEY = "sedum-note:lastActivityAt";

export function readLastActivityTime(): number | null {
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : null;
}

export function writeLastActivityTime(time: number): void {
  localStorage.setItem(STORAGE_KEY, String(time));
}

// 「このデバイスのデータを消す」で使う。
export function clearLastActivityTime(): void {
  localStorage.removeItem(STORAGE_KEY);
}

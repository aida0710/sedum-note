// スペースのロックを解除しているウィンドウがあるかを、ほかのウィンドウから見られるようにする印。解除している間、
// そのスペースの名前の Web Locks の共有のロックを持つ（何個のウィンドウでも同時に持てる）。ロックしたら手放し、ウィンドウを閉じれば
// ブラウザが手放す。ロックの画面のウィンドウは、印を持つウィンドウがあるときだけ、キーを頼んで返事を待つ（session/unlockedKeyHandoff.ts）。
// Web 版では、同じ出どころのほかのページにもロックの名前は見える。キーは載せない、中身の無い印なので、見えても困らない。

import { hasWebLocks, holdWebLock, isWebLockHeld } from "./webLocks";

function presenceLockName(spaceId: string): string {
  return `sedum-note:unlocked:${spaceId}`;
}

// 印を持つ。返した関数で手放す。Web Locks の無い環境では、何もしない。
export function holdUnlockedPresence(spaceId: string): () => void {
  return hasWebLocks() ? holdWebLock(presenceLockName(spaceId), { mode: "shared" }) : () => undefined;
}

// このスペースの印を持つウィンドウがあるか（自分が印を持っていないとき、つまりロックの画面で呼ぶ）。
// Web Locks の無い環境では分からないので、無いことにする（返事を待たずに、パスフレーズを聞く）。
export async function isUnlockedInAnotherWindow(spaceId: string): Promise<boolean> {
  return hasWebLocks() && isWebLockHeld(presenceLockName(spaceId));
}

// このウィンドウでロックを解除しているスペースのマスターキー（と、その vault の ID）。ロックするまでメモリに持ち、スペースを
// 切り替えて戻ったときと、ほかのウィンドウから頼まれたとき（unlockedKeyHandoff.ts）に使う。平文の保存には置かない。
// 持っている間は、そのスペースの「解除している印」（platform/unlockedPresence.ts）を持ち、ほかのウィンドウが頼む相手がいるかを見られるようにする。
// ロック（forgetUnlockedSpaces）のたびに数を進める。キーを受け取るのを待つ間にロックが来たら、受け取ったキーで開かないために、
// 頼む前と開いたあとでこの数を比べる（ロックの合図と、キーの返事の届く順は決まっていない）。

import type { VaultKey } from "../../core/vault/vaultSession";
import { onWindowSignal } from "../platform/crossWindowStorage";
import { holdUnlockedPresence } from "../platform/unlockedPresence";

type UnlockedSpace = { key: VaultKey; releasePresence: () => void };

const unlockedSpaces = new Map<string, UnlockedSpace>();
let locksInThisWindow = 0;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function rememberUnlockedSpace(spaceId: string, key: VaultKey): void {
  const releasePresence = unlockedSpaces.get(spaceId)?.releasePresence ?? holdUnlockedPresence(spaceId);
  unlockedSpaces.set(spaceId, { key, releasePresence });
  notifyListeners();
}

export function unlockedKeyOf(spaceId: string): VaultKey | null {
  return unlockedSpaces.get(spaceId)?.key ?? null;
}

// スペースの手元の保存を消すときに呼ぶ（ロックではないので、ロックの数は進めない）。
export function forgetUnlockedSpace(spaceId: string): void {
  unlockedSpaces.get(spaceId)?.releasePresence();
  unlockedSpaces.delete(spaceId);
  notifyListeners();
}

// ロックしたとき（このウィンドウでも、ほかのウィンドウでも）に呼ぶ。全部のスペースが、パスフレーズかほかのウィンドウのキーで
// 開き直すまで開けなくなる。
export function forgetUnlockedSpaces(): void {
  for (const { releasePresence } of unlockedSpaces.values()) {
    releasePresence();
  }
  unlockedSpaces.clear();
  locksInThisWindow += 1;
  notifyListeners();
}

// ほかのウィンドウでロックしたら、このウィンドウのキーも捨てる。起動のときに 1 度呼ぶ（画面の部品の作り直しで受け取りを止めると、
// その間に届いたロックの合図を落とすので、画面の部品では受け取らない）。
export function followLocksOfOtherWindows(): () => void {
  return onWindowSignal((signal) => {
    if (signal === "lock") {
      forgetUnlockedSpaces();
    }
  });
}

// このウィンドウが、開いてから何回ロックしたか（ほかのウィンドウのロックも数える）。
export function lockCountOfThisWindow(): number {
  return locksInThisWindow;
}

export function subscribeUnlockedSpaces(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

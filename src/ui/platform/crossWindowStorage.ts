// アプリを 2 つのウィンドウ（Web 版なら 2 つのタブ）で開いたときに、同じ手元の保存を安全に使うための部品。
//   書き込みの順番待ち  Web Locks で、ウィンドウをまたいで 1 つずつ書く
//   書いた記録の知らせ  BroadcastChannel で、書いた記録の ID をほかのウィンドウへ知らせる（中身は流さない）
// どちらも、同じ vault を開いているウィンドウの間だけで働くよう、名前に vault の ID を入れる。

import { SerialQueue, type WriteQueue } from "../../core/local/serialQueue";
import type { RecordChangeChannel } from "../../core/notes/recordChangeChannel";

export function createCrossWindowWriteQueue(vaultId: string): WriteQueue {
  // Web Locks の無い環境（古い WebView）では、このウィンドウの中だけで順に流す。
  if (!("locks" in navigator)) {
    return new SerialQueue();
  }
  const lockName = `sedum-note:write:${vaultId}`;
  return { run: (task) => navigator.locks.request(lockName, task) as ReturnType<typeof task> };
}

export function createRecordChangeChannel(vaultId: string): RecordChangeChannel {
  const channel = new BroadcastChannel(`sedum-note:records:${vaultId}`);
  return {
    announce: (recordId) => channel.postMessage(recordId),
    subscribe: (listener) => {
      const receive = (event: MessageEvent<unknown>) => {
        if (typeof event.data === "string") {
          listener(event.data);
        }
      };
      channel.addEventListener("message", receive);
      return () => channel.removeEventListener("message", receive);
    },
    close: () => channel.close(),
  };
}

// このアプリを開いているウィンドウ全部に伝える合図。lock は「ロックした」、wiped は「このデバイスのデータを消した」。
// データを消すのは、ロックしたままのウィンドウからもできるので、vault ごとには分けない。
export type WindowSignal = "lock" | "wiped";

const WINDOW_SIGNAL_CHANNEL_NAME = "sedum-note:windows";

// ほかのウィンドウへ合図を送る。自分には届かない。
export function sendWindowSignal(signal: WindowSignal): void {
  const channel = new BroadcastChannel(WINDOW_SIGNAL_CHANNEL_NAME);
  channel.postMessage(signal);
  channel.close();
}

// ほかのウィンドウからの合図を受け取る。返した関数で、受け取りをやめる。
export function onWindowSignal(listener: (signal: WindowSignal) => void): () => void {
  const channel = new BroadcastChannel(WINDOW_SIGNAL_CHANNEL_NAME);
  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.data === "lock" || event.data === "wiped") {
      listener(event.data);
    }
  });
  return () => channel.close();
}

// 同じ vault を開いているウィンドウのうち、1 つだけが同期を受け持つ。受け持ちになったら start を呼び、
// 返した関数を呼ぶと受け持ちを降りる（ほかのウィンドウが引き継ぐ）。受け持ちになる前に降りたら、start は呼ばない。
export function holdSyncDuty(vaultId: string, start: () => void): () => void {
  if (!("locks" in navigator)) {
    start();
    return () => undefined;
  }
  let released = false;
  let release: () => void = () => undefined;
  navigator.locks.request(`sedum-note:sync:${vaultId}`, () => new Promise<void>((resolve) => {
    if (released) {
      resolve();
      return;
    }
    release = resolve;
    start();
  // 受け持ちの順番待ちは、ブラウザがこのサイトのデータを消すとき（ウィンドウを閉じる途中など）に、失敗で打ち切られる。
  // そのときは、このウィンドウの保存も一緒に無くなっているので、続きの処理は無い。
  })).catch(() => undefined);
  return () => {
    released = true;
    release();
  };
}

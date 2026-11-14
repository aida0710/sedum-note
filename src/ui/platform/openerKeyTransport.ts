// Web 版で、キーの受け渡しの知らせを運ぶ道。Web 版の出どころ（GitHub Pages の aida0710.github.io）は、同じアカウントのほかの
// ページと共有なので、BroadcastChannel にキーを流すと、同じブラウザで開いたほかのページが受け取れる。そこで、このアプリが
// window.open で開いた別のウィンドウと、それを開いたウィンドウ（window.opener）の間だけで、相手の window へ直接 postMessage する。
//   受け取る  出どころが同じで、送り主が相手（開いたウィンドウか、開いてくれたウィンドウ）のものだけ
//   送る      送る先がまだこのアプリのページ（出どころとパスが同じ）のときだけ。相手のタブが別のページへ移っていたら送らない
// ほかのタブ（このアプリが開いたのではないタブ）とは話さないので、そのタブは今どおりパスフレーズで解除する。

import { isUnlockedKeyMessage, type KeyPeer, type KeyTransport } from "./unlockedKeyMessages";

// このウィンドウが window.open で開いたウィンドウ（戻り値の window）。閉じたものは、送るときに除く。
const openedWindows = new Set<Window>();

export function rememberOpenedWindow(opened: Window): void {
  openedWindows.add(opened);
}

// 相手のウィンドウが、まだこのアプリのページか。別の出どころへ移っていたら、location を読めずに例外になる。
function showsThisApp(other: Window): boolean {
  try {
    return !other.closed && other.location.origin === window.location.origin && other.location.pathname === window.location.pathname;
  } catch {
    return false;
  }
}

function peerOf(other: Window): KeyPeer {
  return {
    post: (message) => {
      if (showsThisApp(other)) {
        other.postMessage(message, window.location.origin);
      }
    },
    isSingleWindow: true,
  };
}

type OpenerKeyTransportInput = {
  // このウィンドウが、メモを 1 つだけ開く別のウィンドウか（platform/noteWindows.ts）。開いてくれたウィンドウと話すのは、このときだけ。
  isNoteWindow: boolean;
};

export function createOpenerKeyTransport({ isNoteWindow }: OpenerKeyTransportInput): KeyTransport {
  const openerOfThisWindow = (): Window | null => {
    const opener = window.opener as Window | null;
    return isNoteWindow && opener !== null && showsThisApp(opener) ? opener : null;
  };
  const isPeer = (source: MessageEventSource | null): source is Window =>
    source !== null && (source === openerOfThisWindow() || openedWindows.has(source as Window));
  const peers = (): Window[] => {
    for (const opened of openedWindows) {
      if (opened.closed) {
        openedWindows.delete(opened);
      }
    }
    const opener = openerOfThisWindow();
    return opener === null ? [...openedWindows] : [opener, ...openedWindows];
  };
  return {
    sendToAll: (message) => {
      for (const peer of peers()) {
        peerOf(peer).post(message);
      }
    },
    firstPeerToAsk: () => {
      const opener = openerOfThisWindow();
      return opener === null ? null : peerOf(opener);
    },
    subscribe: (listener) => {
      const receive = (event: MessageEvent<unknown>) => {
        if (event.origin === window.location.origin && isPeer(event.source) && isUnlockedKeyMessage(event.data)) {
          listener(event.data, peerOf(event.source));
        }
      };
      window.addEventListener("message", receive);
      return () => window.removeEventListener("message", receive);
    },
  };
}

// アプリ（Tauri）のウィンドウの間で、キーの受け渡しの知らせを運ぶ道。アプリの出どころ（tauri://localhost など）には、このアプリの
// ウィンドウしかいないので、BroadcastChannel でキー（CryptoKey。構造化複製で、取り出せないまま渡る）を流してよい。
// Web 版の出どころは、ほかのページと共有なので、この道を使わない（openerKeyTransport.ts）。

import { isUnlockedKeyMessage, type KeyPeer, type KeyTransport } from "./unlockedKeyMessages";

const KEY_CHANNEL_NAME = "sedum-note:unlocked-keys";

export function createAppWindowsKeyTransport(): KeyTransport {
  // 送るのも受け取るのも、この 1 つの通り道で行う。BroadcastChannel は、同じ通り道から送ったものを自分には届けないので、
  // 自分が送った頼みに自分で答えることがない。ウィンドウを閉じるまで使うので、閉じない。
  const channel = new BroadcastChannel(KEY_CHANNEL_NAME);
  const everyWindow: KeyPeer = { post: (message) => channel.postMessage(message), isSingleWindow: false };
  return {
    sendToAll: everyWindow.post,
    firstPeerToAsk: () => everyWindow,
    subscribe: (listener) => {
      const receive = (event: MessageEvent<unknown>) => {
        if (isUnlockedKeyMessage(event.data)) {
          listener(event.data, everyWindow);
        }
      };
      channel.addEventListener("message", receive);
      return () => channel.removeEventListener("message", receive);
    },
  };
}

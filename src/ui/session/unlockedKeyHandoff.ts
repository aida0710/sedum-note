// ロックを全部のウィンドウで共通にするための、マスターキーの受け渡しの決まり。ロックを解除しているウィンドウがあれば、
// ロックの画面のウィンドウ（開いたばかりの別のウィンドウも）は、パスフレーズを聞かずに、そのウィンドウのキーで開く。
//   頼む    解除しているウィンドウ（印。platform/unlockedPresence.ts）があるときだけ、相手に頼んで、返事を KEY_REPLY_TIMEOUT_MS まで待つ。
//           印が無ければ、待たずに null（パスフレーズを聞く）
//   答える  頼まれたスペースのキーを、このウィンドウで解除していれば返す
//   知らせ  解除したら、キーを含まない「解除した」を送る。受け取ったロックの画面のウィンドウは、送り主にキーを頼む
// キーを運ぶ道（KeyTransport）は、アプリと Web 版で違う（keyHandoffOfThisApp.ts）。受け取ったキーが、手元の vault のものかは、
// 開くときに確かめる（core/vault/vaultSession.ts の reopenLocalVaultWithKeyOf）。

import { newRandomId } from "../../core/crypto/randomId";
import type { VaultKey } from "../../core/vault/vaultSession";
import { type KeyPeer, type KeyTransport, unlockedKeyMessage } from "../platform/unlockedKeyMessages";

// キーの返事を待つ上限。答える側は、メモリのキーを返すだけなので、ふつうは数 ms で返る。重い処理（大きなメモの描画、
// ほかのスペースの鍵の導出）の最中でも返る長さにし、それでも来なければ、相手がちょうどロックしたか閉じたと見なしてパスフレーズを聞く。
export const KEY_REPLY_TIMEOUT_MS = 2_000;

type UnlockedKeyHandoffParts = {
  transport: KeyTransport;
  // 自分のほかに、このスペースのロックを解除しているウィンドウがあるか。
  isUnlockedElsewhere: (spaceId: string) => Promise<boolean>;
  // このウィンドウで解除しているスペースのキー（unlockedSpaces.ts）。
  keyOf: (spaceId: string) => VaultKey | null;
  replyTimeoutMs?: number;
};

export class UnlockedKeyHandoff {
  readonly #parts: UnlockedKeyHandoffParts;

  constructor(parts: UnlockedKeyHandoffParts) {
    this.#parts = parts;
  }

  // ほかのウィンドウからの頼みに答える。返した関数で答えるのをやめる。
  answerRequests(): () => void {
    return this.#parts.transport.subscribe((message, sender) => {
      if (message.kind !== "keyRequest") {
        return;
      }
      const key = this.#parts.keyOf(message.spaceId);
      // 1 つの相手とだけ話す道では、持っていないことも返す。全部のウィンドウに届く道では、持っているウィンドウだけが返す
      // （持っていないウィンドウの「無い」が先に届いて、持っているウィンドウの返事を捨てないように）。
      if (key !== null || sender.isSingleWindow) {
        sender.post(unlockedKeyMessage({ kind: "key", spaceId: message.spaceId, requestId: message.requestId, key }));
      }
    });
  }

  // このスペースを解除しているウィンドウがあれば、そのキーを受け取る。誰も解除していない・返事が来なければ null。
  async requestKey(spaceId: string): Promise<VaultKey | null> {
    const peer = this.#parts.transport.firstPeerToAsk();
    if (peer === null || !(await this.#parts.isUnlockedElsewhere(spaceId))) {
      return null;
    }
    return this.#requestFrom(peer, spaceId);
  }

  // このウィンドウでスペースのロックを解除したことを知らせる（キーは送らない。欲しいウィンドウが頼む）。
  announceUnlocked(spaceId: string): void {
    this.#parts.transport.sendToAll(unlockedKeyMessage({ kind: "unlocked", spaceId }));
  }

  // ほかのウィンドウでこのスペースのロックを解除したら、listener を呼ぶ。listener に渡す関数で、知らせてきたウィンドウにキーを頼める。
  onUnlockedElsewhere(spaceId: string, listener: (requestKey: () => Promise<VaultKey | null>) => void): () => void {
    return this.#parts.transport.subscribe((message, sender) => {
      if (message.kind === "unlocked" && message.spaceId === spaceId) {
        listener(() => this.#requestFrom(sender, spaceId));
      }
    });
  }

  #requestFrom(peer: KeyPeer, spaceId: string): Promise<VaultKey | null> {
    const requestId = newRandomId();
    return new Promise((resolve) => {
      const finish = (key: VaultKey | null) => {
        clearTimeout(timer);
        stopListening();
        resolve(key);
      };
      const stopListening = this.#parts.transport.subscribe((message) => {
        if (message.kind === "key" && message.requestId === requestId && message.spaceId === spaceId) {
          finish(message.key);
        }
      });
      const timer = setTimeout(() => finish(null), this.#parts.replyTimeoutMs ?? KEY_REPLY_TIMEOUT_MS);
      peer.post(unlockedKeyMessage({ kind: "keyRequest", spaceId, requestId }));
    });
  }
}

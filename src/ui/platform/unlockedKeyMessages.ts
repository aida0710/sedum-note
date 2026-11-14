// ロックを解除しているウィンドウから、ロックの画面のウィンドウへマスターキーを渡すときに、ウィンドウの間でやり取りする知らせと、
// それを運ぶ道（KeyTransport）の形。道は、アプリ（appWindowsKeyTransport.ts）と Web 版（openerKeyTransport.ts）で違う。
// 決まりは session/unlockedKeyHandoff.ts。

import type { VaultKey } from "../../core/vault/vaultSession";

// ほかの用途の postMessage（ライブラリなど）と見分ける印。
const MESSAGE_APP = "sedum-note:unlocked-key";

export type UnlockedKeyMessage =
  // スペースのロックを解除した（キーは含まない）。
  | { app: typeof MESSAGE_APP; kind: "unlocked"; spaceId: string }
  // スペースのキーを頼む。requestId は頼みごとにランダムな ID で、返事を見分けるのに使う。
  | { app: typeof MESSAGE_APP; kind: "keyRequest"; spaceId: string; requestId: string }
  // 頼みへの返事。持っていなければ key は null（1 つの相手とだけ話す道のときだけ返す。unlockedKeyHandoff.ts）。
  | { app: typeof MESSAGE_APP; kind: "key"; spaceId: string; requestId: string; key: VaultKey | null };

// 知らせの中身（印を除いたもの）。種類ごとに印を外す（Omit を合併型にそのまま当てると、種類ごとの項目が消える）。
type MessageBody = UnlockedKeyMessage extends infer Message ? (Message extends UnlockedKeyMessage ? Omit<Message, "app"> : never) : never;

export function unlockedKeyMessage(body: MessageBody): UnlockedKeyMessage {
  return { app: MESSAGE_APP, ...body };
}

// 知らせを送る相手。
export type KeyPeer = {
  post: (message: UnlockedKeyMessage) => void;
  // 相手が 1 つのウィンドウか。1 つなら、答える側はキーを持っていないことも返す（頼んだ側が、待ちの上限まで待たずに済む）。
  // アプリの BroadcastChannel は全部のウィンドウに届くので、キーを持っているウィンドウだけが返す。
  isSingleWindow: boolean;
};

export type KeyTransport = {
  // 話せる全部の相手へ送る。
  sendToAll: (message: UnlockedKeyMessage) => void;
  // ロックの画面のウィンドウが、最初にキーを頼む相手。いなければ null。
  firstPeerToAsk: () => KeyPeer | null;
  // 話せる相手からの知らせを受け取る。sender に送ると、その相手へ返せる。返した関数で受け取りをやめる。
  subscribe: (listener: (message: UnlockedKeyMessage, sender: KeyPeer) => void) => () => void;
};

const isText = (value: unknown): value is string => typeof value === "string" && value !== "";

function isVaultKey(value: unknown): value is VaultKey {
  const candidate = value as Partial<VaultKey> | null;
  return typeof candidate === "object" && candidate !== null && isText(candidate.vaultId) && candidate.masterKey instanceof CryptoKey;
}

export function isUnlockedKeyMessage(value: unknown): value is UnlockedKeyMessage {
  const candidate = value as Partial<Record<string, unknown>> | null;
  if (typeof candidate !== "object" || candidate === null || candidate.app !== MESSAGE_APP || !isText(candidate.spaceId)) {
    return false;
  }
  switch (candidate.kind) {
    case "unlocked":
      return true;
    case "keyRequest":
      return isText(candidate.requestId);
    case "key":
      return isText(candidate.requestId) && (candidate.key === null || isVaultKey(candidate.key));
    default:
      return false;
  }
}

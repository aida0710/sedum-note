// アプリ内の AI との、過去の会話。あとから開いて読み、続きを話せるように手元に残す。
// 会話には、利用者の発言と AI の答え（メモの中身が入ることがある）が入るので、マスターキーで暗号化して置く。
// このデバイスのこのスペースだけのもので、同期もバックアップもしない。このデバイスのデータを消すと一緒に消える。

import { open, seal } from "../crypto/sealedBox";
import type { LocalStore } from "../local/localStore";

const AI_CHATS_BINDING = "settings:aiChats";
const AI_CHATS_NAME = "sealedAiChats";
// 残す会話の数。新しく話した順に、これを超えた古い会話から消す（全部を 1 つの暗号文にしているので、増えるほど読み書きが重い）。
export const MAX_SAVED_AI_CHATS = 50;
// 発言の形（ui/ai/aiConversation.ts の AiChatMessage）の版。発言の形を変えたら上げる。版の違う会話は読み込むときに捨てる
// （中身は会話だけで、前の形を読む処理は持たない）。1 は版を書いていなかった形（会話の配列だけ）。
export const SAVED_AI_CHAT_FORMAT_VERSION = 2;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Message は、画面が決める発言の形（ui/ai/aiConversation.ts）。ここでは中身を見ずに、そのまま残す。
export type SavedAiChat<Message> = {
  id: string;
  // 一覧に出す名前（最初の発言から作る）。
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
};

type StoredAiChats<Message> = { version: number; chats: SavedAiChat<Message>[] };

// 新しく話した順に返す。まだ何も残していなければ空。版の違う形で残した会話も空にする（次に書くときに消える）。
export async function readSavedAiChats<Message>(localStore: LocalStore, masterKey: CryptoKey): Promise<SavedAiChat<Message>[]> {
  const sealed = await localStore.readSetting<Uint8Array>(AI_CHATS_NAME);
  if (!sealed) {
    return [];
  }
  const stored = JSON.parse(textDecoder.decode(await open(masterKey, sealed, AI_CHATS_BINDING))) as StoredAiChats<Message> | unknown[];
  return !Array.isArray(stored) && stored.version === SAVED_AI_CHAT_FORMAT_VERSION ? stored.chats : [];
}

// 新しく話した順に並べ直し、MAX_SAVED_AI_CHATS を超えた分を除いて書く。書いた一覧を返す。
export async function writeSavedAiChats<Message>(localStore: LocalStore, masterKey: CryptoKey, chats: SavedAiChat<Message>[]): Promise<SavedAiChat<Message>[]> {
  const kept = [...chats].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, MAX_SAVED_AI_CHATS);
  const stored: StoredAiChats<Message> = { version: SAVED_AI_CHAT_FORMAT_VERSION, chats: kept };
  await localStore.writeSetting(AI_CHATS_NAME, await seal(masterKey, textEncoder.encode(JSON.stringify(stored)), AI_CHATS_BINDING));
  return kept;
}

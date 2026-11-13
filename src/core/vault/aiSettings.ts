// アプリ内の AI の設定（有効か、つなぎ先、API キー、モデル）。API キーを知っていれば利用者の料金で AI を使えるので、
// マスターキーで暗号化して手元に置く。ロックしている間は、手元にも平文のキーが無い。
// このデバイスだけの設定で、同期もバックアップもしない。

import { open, seal } from "../crypto/sealedBox";
import type { LocalStore } from "../local/localStore";

const AI_SETTINGS_BINDING = "settings:ai";
const AI_SETTINGS_NAME = "sealedAiSettings";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// claude: Claude の API。openAiCompatible: OpenAI 互換のエンドポイント（ローカルの LLM、OpenAI の API など）。
export const AI_PROVIDERS = ["claude", "openAiCompatible"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

// 選べるモデル。一覧は、API キー（とエンドポイント）を確かめたときに、つなぎ先から取ってきて覚える。
export type AiModelOption = {
  id: string;
  // 画面に出す名前。つなぎ先が名前を返さなければ id と同じ。
  name: string;
  // 1 回の答えの長さの上限（トークン）。つなぎ先が返さなければ null。
  maxOutputTokens: number | null;
};

// アプリ内の AI に、メモの操作を許すか。操作の種類ごとに選ぶ。deny は許可しない（呼ばれたら断る）、ask は毎回聞く、
// allow は聞かずに行う。
export const AI_TOOL_PERMISSIONS = ["deny", "ask", "allow"] as const;
export type AiToolPermission = (typeof AI_TOOL_PERMISSIONS)[number];

// 操作の種類（ui/noteTools/noteTool.ts の NoteToolCategory と同じ）。read はメモを探す・読む、edit はメモやノートブックを
// 作る・直す（ゴミ箱から戻すを含む）、trash はゴミ箱に入れる・ノートブックを消す、permanentDelete は完全に削除する。
export type AiToolPermissions = { read: AiToolPermission; edit: AiToolPermission; trash: AiToolPermission; permanentDelete: AiToolPermission };

// 既定: 読むのは聞かずに行い、変えるのは毎回聞き、完全な削除はさせない。
export const DEFAULT_AI_TOOL_PERMISSIONS: AiToolPermissions = { read: "allow", edit: "ask", trash: "ask", permanentDelete: "deny" };

// model は、models の中から選んだもの（models が空なら、前の版で手で入れた名前のことがある）。
export type AiSettings = {
  enabled: boolean;
  provider: AiProvider;
  // AI が出したメモの直しの案を、承認を待たずに適用する（全部を承認する形）。適用する前の状態は、いつも履歴に残す。
  autoApplyEdits: boolean;
  claude: { apiKey: string; model: string; models: AiModelOption[] };
  // baseUrl は、/chat/completions の手前まで（例: http://127.0.0.1:11434/v1）。API キーの要らないサーバーでは空にする。
  openAiCompatible: { baseUrl: string; apiKey: string; model: string; models: AiModelOption[] };
};

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  provider: "claude",
  autoApplyEdits: false,
  claude: { apiKey: "", model: DEFAULT_CLAUDE_MODEL, models: [] },
  openAiCompatible: { baseUrl: "http://127.0.0.1:11434/v1", apiKey: "", model: "", models: [] },
};

// まだ設定していなければ、無効の設定を返す（保存はしない）。
export async function readAiSettings(localStore: LocalStore, masterKey: CryptoKey): Promise<AiSettings> {
  const sealed = await localStore.readSetting<Uint8Array>(AI_SETTINGS_NAME);
  if (!sealed) {
    return DEFAULT_AI_SETTINGS;
  }
  const stored = JSON.parse(textDecoder.decode(await open(masterKey, sealed, AI_SETTINGS_BINDING))) as Partial<AiSettings>;
  return {
    ...DEFAULT_AI_SETTINGS,
    ...stored,
    claude: { ...DEFAULT_AI_SETTINGS.claude, ...stored.claude },
    openAiCompatible: { ...DEFAULT_AI_SETTINGS.openAiCompatible, ...stored.openAiCompatible },
  };
}

export async function writeAiSettings(localStore: LocalStore, masterKey: CryptoKey, settings: AiSettings): Promise<void> {
  await localStore.writeSetting(AI_SETTINGS_NAME, await seal(masterKey, textEncoder.encode(JSON.stringify(settings)), AI_SETTINGS_BINDING));
}

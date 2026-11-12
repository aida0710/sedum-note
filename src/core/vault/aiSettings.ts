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

export type AiSettings = {
  enabled: boolean;
  provider: AiProvider;
  claude: { apiKey: string; model: string };
  // baseUrl は、/chat/completions の手前まで（例: http://127.0.0.1:11434/v1）。API キーの要らないサーバーでは空にする。
  openAiCompatible: { baseUrl: string; apiKey: string; model: string };
};

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  provider: "claude",
  claude: { apiKey: "", model: DEFAULT_CLAUDE_MODEL },
  openAiCompatible: { baseUrl: "http://127.0.0.1:11434/v1", apiKey: "", model: "" },
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

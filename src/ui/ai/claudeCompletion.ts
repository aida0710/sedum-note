// Claude の API に文を渡して、答えを少しずつ受け取る。公式の SDK を使い、SDK は最初に使うときにだけ読み込む。

import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import type { AiConversation } from "./aiConversation";
import { createClaudeClient, userFacingClaudeError } from "./claudeClient";

type ClaudeCompletionInput = {
  apiKey: string;
  model: string;
  // モデルの一覧で分かった、答えの長さの上限。分からなければ null。
  maxOutputTokens: number | null;
  conversation: AiConversation;
  // 答えの文字が届くたびに呼ぶ（届いた分だけ）。
  onText: (text: string) => void;
  signal: AbortSignal;
};

// 長い答えでも途中で切れないよう、出力の上限は大きく取る（ストリーミングなので、時間切れの心配は無い）。
// モデルの上限の方が小さければ、そちらに合わせる（超えると断られる）。
const MAX_OUTPUT_TOKENS = 64000;
// 安全上の理由で断られたときに、API の側で別のモデルに回す仕組み（サーバー側のフォールバック）を使えるモデル。
const MODELS_WITH_SERVER_SIDE_FALLBACK = new Set(["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
const SERVER_SIDE_FALLBACK_BETA = "server-side-fallback-2026-07-01";

export async function streamClaudeCompletion({ apiKey, model, maxOutputTokens, conversation, onText, signal }: ClaudeCompletionInput): Promise<void> {
  const { client, sdk } = await createClaudeClient(apiKey);
  const maxTokens = Math.min(MAX_OUTPUT_TOKENS, maxOutputTokens ?? MAX_OUTPUT_TOKENS);
  const fallback = MODELS_WITH_SERVER_SIDE_FALLBACK.has(model) ? { betas: [SERVER_SIDE_FALLBACK_BETA], fallbacks: "default" as const } : {};
  try {
    const stream = client.beta.messages.stream(
      // 会話は毎回、最初から全部送る。前の回までと同じ部分はキャッシュから読まれるようにして、料金と待ち時間を減らす。
      { model, max_tokens: maxTokens, cache_control: { type: "ephemeral" }, system: conversation.system, messages: conversation.messages, ...fallback },
      { signal },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        onText(event.delta.text);
      }
    }
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      throw new UserFacingError(translate("ai.error.refused"));
    }
    if (message.stop_reason === "max_tokens") {
      throw new UserFacingError(translate("ai.error.truncated"));
    }
  } catch (error) {
    if (error instanceof UserFacingError || signal.aborted) {
      throw error;
    }
    throw userFacingClaudeError(sdk, error, model);
  }
}

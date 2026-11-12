// Claude の API に文を渡して、答えを少しずつ受け取る。公式の SDK を使い、SDK は最初に使うときにだけ読み込む。

import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import type { AiPrompt } from "./aiTasks";

type ClaudeCompletionInput = {
  apiKey: string;
  model: string;
  prompt: AiPrompt;
  // 答えの文字が届くたびに呼ぶ（届いた分だけ）。
  onText: (text: string) => void;
  signal: AbortSignal;
};

// 長い答えでも途中で切れないよう、出力の上限は大きく取る（ストリーミングなので、時間切れの心配は無い）。
const MAX_OUTPUT_TOKENS = 64000;
// 安全上の理由で断られたときに、API の側で別のモデルに回す仕組み（サーバー側のフォールバック）を使えるモデル。
const MODELS_WITH_SERVER_SIDE_FALLBACK = new Set(["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
const SERVER_SIDE_FALLBACK_BETA = "server-side-fallback-2026-07-01";

export async function streamClaudeCompletion({ apiKey, model, prompt, onText, signal }: ClaudeCompletionInput): Promise<void> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  // このアプリは利用者の手元で動き、API キーは利用者自身のもの（暗号化して手元に置いている）なので、画面から直接呼ぶ。
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const fallback = MODELS_WITH_SERVER_SIDE_FALLBACK.has(model) ? { betas: [SERVER_SIDE_FALLBACK_BETA], fallbacks: "default" as const } : {};
  try {
    const stream = client.beta.messages.stream(
      { model, max_tokens: MAX_OUTPUT_TOKENS, system: prompt.system, messages: [{ role: "user", content: prompt.user }], ...fallback },
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
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new UserFacingError(translate("ai.error.authentication"));
    }
    if (error instanceof Anthropic.NotFoundError) {
      throw new UserFacingError(translate("ai.error.modelNotFound", { model }));
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new UserFacingError(translate("ai.error.rateLimited"));
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new UserFacingError(translate("ai.error.connection"));
    }
    if (error instanceof Anthropic.APIError) {
      throw new UserFacingError(translate("ai.error.api", { status: String(error.status ?? ""), reason: error.message }));
    }
    throw error;
  }
}

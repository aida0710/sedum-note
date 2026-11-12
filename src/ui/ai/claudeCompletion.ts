// Claude の API に会話を渡して、答えを少しずつ受け取る。公式の SDK を使い、SDK は最初に使うときにだけ読み込む。
// 答えが道具（メモの直しの案）を呼んだら、その呼び出しを返す。

import type { BetaContentBlockParam, BetaMessageParam, BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import type { AiConversation, AiConversationMessage } from "./aiConversation";
import { createClaudeClient, userFacingClaudeError } from "./claudeClient";
import type { AiToolCall, AiToolDefinition } from "./noteEditTool";

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

function claudeTool(tool: AiToolDefinition): BetaTool {
  // strict で、入力が決まりどおりの形で返るようにする。ストリーミングでは、長い入力（メモの本文）も届いた分から
  // 送らせる（eager_input_streaming）。その場合、途中で切れた入力が届きうるので、使う側で形を確かめる（noteEditInputOf）。
  return { name: tool.name, description: tool.description, input_schema: tool.inputSchema as BetaTool.InputSchema, strict: true, eager_input_streaming: true };
}

function claudeMessage(message: AiConversationMessage): BetaMessageParam {
  if (message.role === "assistant") {
    if (!message.toolCall) {
      return { role: "assistant", content: message.content };
    }
    const content: BetaContentBlockParam[] = message.content === "" ? [] : [{ type: "text", text: message.content }];
    content.push({ type: "tool_use", id: message.toolCall.id, name: message.toolCall.name, input: message.toolCall.input as Record<string, unknown> });
    return { role: "assistant", content };
  }
  if (!message.toolResult) {
    return { role: "user", content: message.content };
  }
  // 道具を呼んだ答えの次の発言は、呼び出しの結果から始める（API の決まり）。
  return {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: message.toolResult.toolCallId, content: message.toolResult.content }, { type: "text", text: message.content }],
  };
}

export async function streamClaudeCompletion({ apiKey, model, maxOutputTokens, conversation, onText, signal }: ClaudeCompletionInput): Promise<AiToolCall | null> {
  const { client, sdk } = await createClaudeClient(apiKey);
  const maxTokens = Math.min(MAX_OUTPUT_TOKENS, maxOutputTokens ?? MAX_OUTPUT_TOKENS);
  const fallback = MODELS_WITH_SERVER_SIDE_FALLBACK.has(model) ? { betas: [SERVER_SIDE_FALLBACK_BETA], fallbacks: "default" as const } : {};
  const tools = conversation.tools.length === 0 ? {} : { tools: conversation.tools.map(claudeTool) };
  try {
    const stream = client.beta.messages.stream(
      // 会話は毎回、最初から全部送る。前の回までと同じ部分はキャッシュから読まれるようにして、料金と待ち時間を減らす。
      {
        model, max_tokens: maxTokens, cache_control: { type: "ephemeral" }, system: conversation.system,
        messages: conversation.messages.map(claudeMessage), ...tools, ...fallback,
      },
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
    // 上限で切れた答えの道具の呼び出しは、入力が途中までしか無いので使わない。
    if (message.stop_reason === "max_tokens") {
      throw new UserFacingError(translate("ai.error.truncated"));
    }
    const toolUse = message.content.find((block) => block.type === "tool_use");
    return toolUse ? { id: toolUse.id, name: toolUse.name, input: toolUse.input } : null;
  } catch (error) {
    if (error instanceof UserFacingError || signal.aborted) {
      throw error;
    }
    throw userFacingClaudeError(sdk, error, model);
  }
}

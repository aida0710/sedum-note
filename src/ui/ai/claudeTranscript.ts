// Claude の API へ送る会話（aiTranscript.ts の決まり）。公式の SDK で 1 ステップずつ頼み、答えの中身（content の
// ブロック）は、thinking ブロックも含めて変えずに会話に足す。ツールの結果は、1 つの答えの分を 1 つの user の発言にまとめる。

import type { BetaContentBlockParam, BetaMessageParam, BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import {
  type AiStep, type AiStepRequest, type AiStopReason, type AiTextMessage, type AiToolCall, type AiToolDefinition, type AiToolResult, type AiTranscript,
  textMessagesForRebuild, toolArgumentsOf,
} from "./aiTranscript";
import { createClaudeClient, userFacingClaudeError } from "./claudeClient";

export type ClaudeConnection = {
  apiKey: string;
  model: string;
  // モデルの一覧で分かった、答えの長さの上限。分からなければ null。
  maxOutputTokens: number | null;
};

// 長い答えでも途中で切れないよう、出力の上限は大きく取る（ストリーミングなので、時間切れの心配は無い）。
// モデルの上限の方が小さければ、そちらに合わせる（超えると断られる）。
const MAX_OUTPUT_TOKENS = 64000;
// 安全上の理由で断られたときに、API の側で別のモデルに回す仕組み（サーバー側のフォールバック）を使えるモデル。
const MODELS_WITH_SERVER_SIDE_FALLBACK = new Set(["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
const SERVER_SIDE_FALLBACK_BETA = "server-side-fallback-2026-07-01";

// 答えの中身（content のブロックの並び）。
export type ClaudeAnswer = BetaContentBlockParam[];

function claudeTool(tool: AiToolDefinition): BetaTool {
  // 長い入力（メモの本文）も、届いた分から送らせる（eager_input_streaming）。その場合 API は入力を確かめないので、
  // 届いた入力の文字を自分で読み（toolArgumentsOf）、引数はツールの側（noteTools/toolArguments.ts）で確かめる。
  // strict は付けない（数の範囲の指定に対応しておらず、範囲はツールの側で丸めているため）。
  return { name: tool.name, description: tool.description, input_schema: tool.inputSchema as BetaTool.InputSchema, eager_input_streaming: true };
}

function stopReasonOf(stopReason: string | null, toolCalls: AiToolCall[]): AiStopReason {
  if (stopReason === "max_tokens" || stopReason === "model_context_window_exceeded") {
    return "maxTokens";
  }
  if (stopReason === "refusal") {
    return "refusal";
  }
  return toolCalls.length > 0 ? "toolUse" : "end";
}

export class ClaudeTranscript implements AiTranscript<ClaudeAnswer> {
  readonly #connection: ClaudeConnection;
  readonly #system: string;
  readonly #tools: BetaTool[];
  readonly #messages: BetaMessageParam[] = [];

  // previousMessages は、送った形が手元に無いときに作り直す、文だけの会話。
  constructor(connection: ClaudeConnection, { system, tools, previousMessages }: { system: string; tools: AiToolDefinition[]; previousMessages: AiTextMessage[] }) {
    this.#connection = connection;
    this.#system = system;
    this.#tools = tools.map(claudeTool);
    for (const message of textMessagesForRebuild(previousMessages)) {
      this.#messages.push({ role: message.role, content: [{ type: "text", text: message.text }] });
    }
  }

  addUserMessage(content: string): void {
    const last = this.#messages[this.#messages.length - 1];
    const text: BetaContentBlockParam = { type: "text", text: content };
    // ツールの結果のあとの発言は、同じ user の発言の、結果のあとに足す（API の決まり）。
    if (last?.role === "user") {
      last.content = [...(typeof last.content === "string" ? [{ type: "text" as const, text: last.content }] : last.content), text];
      return;
    }
    this.#messages.push({ role: "user", content: [text] });
  }

  addStep(step: AiStep<ClaudeAnswer>, results: AiToolResult[]): void {
    // 中身の無い答え（何も書かずに終えた）は足さない。空の答えを含む会話は断られる。
    if (step.answer.length > 0) {
      this.#messages.push({ role: "assistant", content: step.answer });
    }
    if (results.length > 0) {
      this.#messages.push({
        role: "user",
        content: results.map((result) => ({ type: "tool_result", tool_use_id: result.toolCallId, content: result.content, is_error: result.isError })),
      });
    }
  }

  async requestStep({ onText, onToolCallStart, signal }: AiStepRequest): Promise<AiStep<ClaudeAnswer>> {
    const { apiKey, model, maxOutputTokens } = this.#connection;
    const { client, sdk } = await createClaudeClient(apiKey);
    const fallback = MODELS_WITH_SERVER_SIDE_FALLBACK.has(model) ? { betas: [SERVER_SIDE_FALLBACK_BETA], fallbacks: "default" as const } : {};
    const tools = this.#tools.length === 0 ? {} : { tools: this.#tools };
    try {
      const stream = client.beta.messages.stream(
        // 会話は毎回、最初から全部送る。前の回までと同じ部分はキャッシュから読まれるようにして、料金と待ち時間を減らす。
        {
          model, max_tokens: Math.min(MAX_OUTPUT_TOKENS, maxOutputTokens ?? MAX_OUTPUT_TOKENS), cache_control: { type: "ephemeral" },
          system: this.#system, messages: this.#messages, ...tools, ...fallback,
        },
        { signal },
      );
      // ブロックの番号ごとの、ツールの入力の文字（届いた分をつないだもの）。
      const rawInputs = new Map<number, string>();
      for await (const event of stream) {
        if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
          rawInputs.set(event.index, "");
          onToolCallStart(event.content_block.name);
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          onText(event.delta.text);
        } else if (event.type === "content_block_delta" && event.delta.type === "input_json_delta") {
          rawInputs.set(event.index, (rawInputs.get(event.index) ?? "") + event.delta.partial_json);
        }
      }
      const message = await stream.finalMessage();
      const toolCalls = message.content.flatMap((block, index): AiToolCall[] => {
        if (block.type !== "tool_use") {
          return [];
        }
        const rawInput = rawInputs.get(index) ?? JSON.stringify(block.input);
        return [{ id: block.id, name: block.name, input: toolArgumentsOf(rawInput), rawInput }];
      });
      const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
      return { text, toolCalls, stopReason: stopReasonOf(message.stop_reason, toolCalls), answeredWithoutTools: false, answer: message.content as ClaudeAnswer };
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      // API の失敗でない SDK の失敗は、届いた答えを読めなかったもの（ツールの入力の JSON をまったく読めなかった、
      // ストリームが途中で終わった）。
      if (error instanceof sdk.AnthropicError && !(error instanceof sdk.APIError)) {
        throw new UserFacingError(translate("ai.error.unreadableAnswer"));
      }
      throw userFacingClaudeError(sdk, error, model);
    }
  }
}

// OpenAI 互換のエンドポイント（ローカルの LLM のサーバー、OpenAI の API など）へ送る会話（aiTranscript.ts の決まり）。
// 形式は Chat Completions のストリーミング（「data: 」で始まる行に JSON が 1 つずつ届き、「data: [DONE]」で終わる）。
// 答えは、全部の tool_calls を持つ 1 つの assistant の発言にし、結果は呼び出しごとに role: "tool" の発言を並べる。
//
// ツール（function calling）を知らないサーバーは、要求を 400 で断る。この会話でツール付きの要求がまだ一度も通っていなければ、
// ツールを外して頼み直し、通ったら、この会話ではツールを外したままにする。ツール付きの要求が通ったあとの 400 は、
// 文脈の長さの超過などなので、失敗として出す。

import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import {
  type AiStep, type AiStepRequest, type AiStopReason, type AiTextMessage, type AiToolCall, type AiToolDefinition, type AiToolResult, type AiTranscript,
  textMessagesForRebuild, toolArgumentsOf,
} from "./aiTranscript";

export type OpenAiCompatibleConnection = { baseUrl: string; apiKey: string; model: string };

const STREAM_DATA_PREFIX = "data:";
const STREAM_END_MARK = "[DONE]";
// エラーの知らせに出す、サーバーの返した文の長さ。
const ERROR_REASON_MAX_LENGTH = 300;

// ツールの呼び出しの断片。1 つの呼び出しが、index の同じ断片に分かれて届く（id と名前は最初の断片にだけある）。
export type ToolCallFragment = { index: number; id?: string; name?: string; arguments?: string };

// ストリームの 1 行の中身。答えの文字、ツールの呼び出しの断片、終わった理由（最後の行にだけある）。
export type StreamLineContent = { text: string; toolCallFragments: ToolCallFragment[]; finishReason: string | null };

type StreamChunk = {
  choices?: Array<{
    delta?: { content?: unknown; tool_calls?: Array<{ index?: unknown; id?: unknown; function?: { name?: unknown; arguments?: unknown } }> };
    finish_reason?: unknown;
  }>;
};

const EMPTY_LINE_CONTENT: StreamLineContent = { text: "", toolCallFragments: [], finishReason: null };

export function streamLineContentOf(line: string): StreamLineContent {
  if (!line.startsWith(STREAM_DATA_PREFIX)) {
    return EMPTY_LINE_CONTENT;
  }
  const data = line.slice(STREAM_DATA_PREFIX.length).trim();
  if (data === "" || data === STREAM_END_MARK) {
    return EMPTY_LINE_CONTENT;
  }
  let chunk: StreamChunk;
  try {
    chunk = JSON.parse(data) as StreamChunk;
  } catch {
    // 途中で切れた行や、JSON でない知らせは読み飛ばす。
    return EMPTY_LINE_CONTENT;
  }
  const choice = chunk.choices?.[0];
  const text = typeof choice?.delta?.content === "string" ? choice.delta.content : "";
  const toolCallFragments = (choice?.delta?.tool_calls ?? []).flatMap((call): ToolCallFragment[] => {
    if (typeof call.index !== "number") {
      return [];
    }
    return [{
      index: call.index,
      id: typeof call.id === "string" ? call.id : undefined,
      name: typeof call.function?.name === "string" ? call.function.name : undefined,
      arguments: typeof call.function?.arguments === "string" ? call.function.arguments : undefined,
    }];
  });
  return { text, toolCallFragments, finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null };
}

// 断片を index ごとにつなぎ、届いた順の呼び出しにする。名前の無い呼び出しは使えないので外す。id を返さないサーバーには、
// 結果と組にするための id をこちらで付ける。
export function toolCallsOfFragments(fragments: ToolCallFragment[]): AiToolCall[] {
  const indexes = [...new Set(fragments.map((fragment) => fragment.index))];
  return indexes.flatMap((index): AiToolCall[] => {
    const parts = fragments.filter((fragment) => fragment.index === index);
    const name = parts.find((fragment) => fragment.name)?.name;
    if (!name) {
      return [];
    }
    const rawInput = parts.map((fragment) => fragment.arguments ?? "").join("");
    return [{ id: parts.find((fragment) => fragment.id)?.id ?? `call_${index}`, name, input: toolArgumentsOf(rawInput), rawInput }];
  });
}

function stopReasonOf(finishReason: string | null, toolCalls: AiToolCall[]): AiStopReason {
  if (finishReason === "length") {
    return "maxTokens";
  }
  if (finishReason === "content_filter") {
    return "refusal";
  }
  return toolCalls.length > 0 ? "toolUse" : "end";
}

type OpenAiMessage = Record<string, unknown>;

// 答え（assistant の発言）。
export type OpenAiCompatibleAnswer = OpenAiMessage;

function answerOf(text: string, toolCalls: AiToolCall[]): OpenAiCompatibleAnswer {
  if (toolCalls.length === 0) {
    return { role: "assistant", content: text };
  }
  // 引数は、届いた文字のまま送り返す。
  const calls = toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.rawInput } }));
  return { role: "assistant", content: text === "" ? null : text, tool_calls: calls };
}

export class OpenAiCompatibleTranscript implements AiTranscript<OpenAiCompatibleAnswer> {
  readonly #connection: OpenAiCompatibleConnection;
  readonly #system: string;
  readonly #tools: OpenAiMessage[];
  readonly #messages: OpenAiMessage[] = [];
  // この会話で、ツール付きの要求が通ったか。
  #toolsAccepted = false;
  // ツールを外して頼み直し、それが通ったか。通ったら、この会話ではツールを外したままにする。
  #toolsUnsupported = false;

  // previousMessages は、送った形が手元に無いときに作り直す、文だけの会話。
  constructor(connection: OpenAiCompatibleConnection, { system, tools, previousMessages }: { system: string; tools: AiToolDefinition[]; previousMessages: AiTextMessage[] }) {
    this.#connection = connection;
    this.#system = system;
    this.#tools = tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }));
    for (const message of textMessagesForRebuild(previousMessages)) {
      this.#messages.push({ role: message.role, content: message.text });
    }
  }

  addUserMessage(content: string): void {
    this.#messages.push({ role: "user", content });
  }

  addStep(step: AiStep<OpenAiCompatibleAnswer>, results: AiToolResult[]): void {
    this.#messages.push(step.answer);
    for (const result of results) {
      // role: "tool" の発言には失敗の印が無いので、文の頭に書く。
      this.#messages.push({ role: "tool", tool_call_id: result.toolCallId, content: result.isError ? `Error: ${result.content}` : result.content });
    }
  }

  async requestStep({ onText, onToolCallStart, signal }: AiStepRequest): Promise<AiStep<OpenAiCompatibleAnswer>> {
    const offersTools = this.#tools.length > 0 && !this.#toolsUnsupported;
    let response = await this.#request(offersTools, signal);
    if (offersTools && response.ok) {
      this.#toolsAccepted = true;
    }
    if (offersTools && response.status === 400 && !this.#toolsAccepted) {
      response = await this.#request(false, signal);
      this.#toolsUnsupported = response.ok;
    }
    if (response.status === 401 || response.status === 403) {
      throw new UserFacingError(translate("ai.error.authentication"));
    }
    if (!response.ok || !response.body) {
      throw new UserFacingError(translate("ai.error.api", { status: String(response.status), reason: (await response.text()).slice(0, ERROR_REASON_MAX_LENGTH) }));
    }
    const { text, toolCallFragments, finishReason } = await readStream(response.body, { onText, onToolCallStart });
    const toolCalls = toolCallsOfFragments(toolCallFragments);
    return { text, toolCalls, stopReason: stopReasonOf(finishReason, toolCalls), answeredWithoutTools: this.#toolsUnsupported, answer: answerOf(text, toolCalls) };
  }

  async #request(withTools: boolean, signal: AbortSignal): Promise<Response> {
    const { baseUrl, apiKey, model } = this.#connection;
    try {
      return await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", ...(apiKey === "" ? {} : { Authorization: `Bearer ${apiKey}` }) },
        body: JSON.stringify({ model, stream: true, messages: [{ role: "system", content: this.#system }, ...this.#messages], ...(withTools ? { tools: this.#tools } : {}) }),
      });
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      throw new UserFacingError(translate("ai.error.connection"));
    }
  }
}

// ストリームを最後まで読み、答えの文とツールの呼び出しの断片と終わった理由を集める。
async function readStream(body: NonNullable<Response["body"]>, { onText, onToolCallStart }: Pick<AiStepRequest, "onText" | "onToolCallStart">): Promise<StreamLineContent> {
  const lines = body.pipeThrough(new TextDecoderStream()).getReader();
  const collected: StreamLineContent = { text: "", toolCallFragments: [], finishReason: null };
  const startedIndexes = new Set<number>();
  let unfinishedLine = "";
  for (;;) {
    const { value, done } = await lines.read();
    if (done) {
      break;
    }
    const received = (unfinishedLine + value).split("\n");
    // 最後の要素は、まだ改行が届いていない行の途中。次に届いた分とつなぐ。
    unfinishedLine = received.pop() ?? "";
    for (const line of received) {
      const content = streamLineContentOf(line.trim());
      if (content.text !== "") {
        collected.text += content.text;
        onText(content.text);
      }
      for (const fragment of content.toolCallFragments) {
        if (fragment.name && !startedIndexes.has(fragment.index)) {
          startedIndexes.add(fragment.index);
          onToolCallStart(fragment.name);
        }
      }
      collected.toolCallFragments.push(...content.toolCallFragments);
      collected.finishReason = content.finishReason ?? collected.finishReason;
    }
  }
  return collected;
}

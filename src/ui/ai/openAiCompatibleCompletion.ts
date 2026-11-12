// OpenAI 互換のエンドポイント（ローカルの LLM のサーバー、OpenAI の API など）に会話を渡して、答えを少しずつ受け取る。
// 形式は Chat Completions のストリーミング（「data: 」で始まる行に JSON が 1 つずつ届き、「data: [DONE]」で終わる）。
// 答えが道具（function）を呼んだら、その呼び出しを返す。道具を受け付けないサーバーには、道具を外して頼み直す。

import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import type { AiConversation, AiConversationMessage } from "./aiConversation";
import type { AiToolCall } from "./noteEditTool";

type OpenAiCompatibleCompletionInput = {
  baseUrl: string;
  apiKey: string;
  model: string;
  conversation: AiConversation;
  onText: (text: string) => void;
  signal: AbortSignal;
};

const STREAM_DATA_PREFIX = "data:";
const STREAM_END_MARK = "[DONE]";

// 道具の呼び出しの断片。1 つの呼び出しが、index の同じ断片に分かれて届く（id と名前は最初の断片にだけある）。
export type ToolCallFragment = { index: number; id?: string; name?: string; arguments?: string };

// ストリームの 1 行の中身。答えの文字と、道具の呼び出しの断片。中身の無い行（空行、コメント、終わりの印）は空。
export type StreamLineContent = { text: string; toolCallFragments: ToolCallFragment[] };

type StreamChunk = {
  choices?: Array<{ delta?: { content?: unknown; tool_calls?: Array<{ index?: unknown; id?: unknown; function?: { name?: unknown; arguments?: unknown } }> } }>;
};

export function streamLineContentOf(line: string): StreamLineContent {
  const empty = { text: "", toolCallFragments: [] };
  if (!line.startsWith(STREAM_DATA_PREFIX)) {
    return empty;
  }
  const data = line.slice(STREAM_DATA_PREFIX.length).trim();
  if (data === "" || data === STREAM_END_MARK) {
    return empty;
  }
  let chunk: StreamChunk;
  try {
    chunk = JSON.parse(data) as StreamChunk;
  } catch {
    // 途中で切れた行や、JSON でない知らせは読み飛ばす。
    return empty;
  }
  const delta = chunk.choices?.[0]?.delta;
  const text = typeof delta?.content === "string" ? delta.content : "";
  const toolCallFragments = (delta?.tool_calls ?? []).flatMap((call): ToolCallFragment[] => {
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
  return { text, toolCallFragments };
}

// 断片をつないで、最初の道具の呼び出しにする。引数の JSON が読めなければ（途中で切れたなど）、入力を null にする
// （使う側が形を確かめて捨てる）。
export function toolCallOfFragments(fragments: ToolCallFragment[]): AiToolCall | null {
  const first = fragments.filter((fragment) => fragment.index === fragments[0]?.index);
  const id = first.find((fragment) => fragment.id)?.id;
  const name = first.find((fragment) => fragment.name)?.name;
  if (!id || !name) {
    return null;
  }
  const argumentsText = first.map((fragment) => fragment.arguments ?? "").join("");
  try {
    return { id, name, input: JSON.parse(argumentsText) as unknown };
  } catch {
    return { id, name, input: null };
  }
}

type OpenAiMessage = Record<string, unknown>;

function openAiMessages(message: AiConversationMessage): OpenAiMessage[] {
  if (message.role === "assistant") {
    if (!message.toolCall) {
      return [{ role: "assistant", content: message.content }];
    }
    const { id, name, input } = message.toolCall;
    return [{ role: "assistant", content: message.content === "" ? null : message.content, tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(input) } }] }];
  }
  const user = { role: "user", content: message.content };
  return message.toolResult ? [{ role: "tool", tool_call_id: message.toolResult.toolCallId, content: message.toolResult.content }, user] : [user];
}

// 道具を受け付けないサーバーへ送り直すときの形。前の道具の呼び出しと結果は、文として会話に残す。
function plainMessage(message: AiConversationMessage): OpenAiMessage {
  if (message.role === "assistant") {
    const call = message.toolCall ? `\n\n(proposed an edit to the open note: ${JSON.stringify(message.toolCall.input)})` : "";
    return { role: "assistant", content: message.content + call };
  }
  return { role: "user", content: message.toolResult ? `(${message.toolResult.content})\n\n${message.content}` : message.content };
}

type ChatRequest = OpenAiCompatibleCompletionInput & { withTools: boolean };

async function requestChat({ baseUrl, apiKey, model, conversation, signal, withTools }: ChatRequest): Promise<Response> {
  const messages = withTools ? conversation.messages.flatMap(openAiMessages) : conversation.messages.map(plainMessage);
  const tools = withTools
    ? { tools: conversation.tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })) }
    : {};
  try {
    return await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", ...(apiKey === "" ? {} : { Authorization: `Bearer ${apiKey}` }) },
      body: JSON.stringify({ model, stream: true, messages: [{ role: "system", content: conversation.system }, ...messages], ...tools }),
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    throw new UserFacingError(translate("ai.error.connection"));
  }
}

export async function streamOpenAiCompatibleCompletion(input: OpenAiCompatibleCompletionInput): Promise<AiToolCall | null> {
  const offersTools = input.conversation.tools.length > 0;
  let response = await requestChat({ ...input, withTools: offersTools });
  // 道具（function calling）を知らないサーバーは、要求を 400 で断る。道具を外して、ふつうの会話として頼み直す。
  if (offersTools && response.status === 400) {
    response = await requestChat({ ...input, withTools: false });
  }
  if (response.status === 401 || response.status === 403) {
    throw new UserFacingError(translate("ai.error.authentication"));
  }
  if (!response.ok || !response.body) {
    throw new UserFacingError(translate("ai.error.api", { status: String(response.status), reason: (await response.text()).slice(0, 300) }));
  }
  const lines = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const toolCallFragments: ToolCallFragment[] = [];
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
        input.onText(content.text);
      }
      toolCallFragments.push(...content.toolCallFragments);
    }
  }
  return toolCallOfFragments(toolCallFragments);
}

// OpenAI 互換のエンドポイント（ローカルの LLM のサーバー、OpenAI の API など）に文を渡して、答えを少しずつ受け取る。
// 形式は Chat Completions のストリーミング（「data: 」で始まる行に JSON が 1 つずつ届き、「data: [DONE]」で終わる）。

import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import type { AiConversation } from "./aiConversation";

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

// ストリームの 1 行から、答えの文字を取り出す。文字の無い行（空行、コメント、終わりの印、役割だけの知らせ）は空の文字。
export function textOfStreamLine(line: string): string {
  if (!line.startsWith(STREAM_DATA_PREFIX)) {
    return "";
  }
  const data = line.slice(STREAM_DATA_PREFIX.length).trim();
  if (data === "" || data === STREAM_END_MARK) {
    return "";
  }
  try {
    const chunk = JSON.parse(data) as { choices?: Array<{ delta?: { content?: unknown } }> };
    const content = chunk.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : "";
  } catch {
    // 途中で切れた行や、JSON でない知らせは読み飛ばす。
    return "";
  }
}

export async function streamOpenAiCompatibleCompletion({ baseUrl, apiKey, model, conversation, onText, signal }: OpenAiCompatibleCompletionInput): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", ...(apiKey === "" ? {} : { Authorization: `Bearer ${apiKey}` }) },
      body: JSON.stringify({ model, stream: true, messages: [{ role: "system", content: conversation.system }, ...conversation.messages] }),
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    throw new UserFacingError(translate("ai.error.connection"));
  }
  if (response.status === 401 || response.status === 403) {
    throw new UserFacingError(translate("ai.error.authentication"));
  }
  if (!response.ok || !response.body) {
    throw new UserFacingError(translate("ai.error.api", { status: String(response.status), reason: (await response.text()).slice(0, 300) }));
  }
  const lines = response.body.pipeThrough(new TextDecoderStream()).getReader();
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
      const text = textOfStreamLine(line.trim());
      if (text !== "") {
        onText(text);
      }
    }
  }
}

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiStepRequest } from "./aiTranscript";
import { ClaudeTranscript } from "./claudeTranscript";

// 試験では Claude の API へつながない。fetch を差し替えて、届いた要求の本文を覚え、決まったストリーミングの答えを返す。

type SentEvent = [name: string, data: object];

function streamBody(events: SentEvent[]): string {
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

const MESSAGE_START: SentEvent = ["message_start", {
  type: "message_start",
  message: { id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } },
}];
const messageEnd = (stopReason: string): SentEvent[] => [
  ["message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 12 } }],
  ["message_stop", { type: "message_stop" }],
];
const thinkingBlock = (index: number): SentEvent[] => [
  ["content_block_start", { type: "content_block_start", index, content_block: { type: "thinking", thinking: "", signature: "" } }],
  ["content_block_delta", { type: "content_block_delta", index, delta: { type: "signature_delta", signature: "sig-1" } }],
  ["content_block_stop", { type: "content_block_stop", index }],
];
const textBlock = (index: number, text: string): SentEvent[] => [
  ["content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }],
  ["content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text } }],
  ["content_block_stop", { type: "content_block_stop", index }],
];
// 入力の文字を 2 つに分けて送る、ツールの呼び出し。
const toolUseBlock = (index: number, id: string, name: string, rawInput: string): SentEvent[] => [
  ["content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id, name, input: {} } }],
  ["content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: rawInput.slice(0, 5) } }],
  ["content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: rawInput.slice(5) } }],
  ["content_block_stop", { type: "content_block_stop", index }],
];

type SentRequest = { messages: Array<{ role: string; content: unknown }>; tools?: Array<Record<string, unknown>>; system: string };

// answers を順に返し、届いた要求の本文を返す。
function mockClaudeApi(answers: SentEvent[][]): SentRequest[] {
  const requests: SentRequest[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)) as SentRequest);
    return new Response(streamBody(answers[requests.length - 1] ?? []), { headers: { "content-type": "text/event-stream" } });
  });
  return requests;
}

const connection = { apiKey: "test-key", model: "claude-opus-5-5", maxOutputTokens: null };
const TOOLS = [{ name: "search_notes", description: "Search", inputSchema: { type: "object", properties: { query: { type: "string" } } } }];
const request = (overrides: Partial<AiStepRequest> = {}): AiStepRequest => ({ onText: () => undefined, onToolCallStart: () => undefined, signal: new AbortController().signal, ...overrides });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Claude の API へ送る会話", () => {
  it("1 つの答えの全部のツールの呼び出しを返し、結果を 1 つの user の発言にまとめる。答えは thinking ブロックごと、変えずに送り返す", async () => {
    const requests = mockClaudeApi([
      [MESSAGE_START, ...thinkingBlock(0), ...textBlock(1, "探します。"),
        ...toolUseBlock(2, "toolu_1", "search_notes", '{"query":"沖縄"}'), ...toolUseBlock(3, "toolu_2", "search_notes", '{"query":"旅行"}'), ...messageEnd("tool_use")],
      [MESSAGE_START, ...textBlock(0, "2 件ありました。"), ...messageEnd("end_turn")],
    ]);
    const transcript = new ClaudeTranscript(connection, { system: "決まり", tools: TOOLS, previousMessages: [] });
    transcript.addUserMessage("沖縄のメモは？");
    const started: string[] = [];
    const step = await transcript.requestStep(request({ onToolCallStart: (name) => started.push(name) }));
    expect(step.stopReason).toBe("toolUse");
    expect(step.text).toBe("探します。");
    expect(step.toolCalls.map((call) => [call.id, call.input])).toEqual([["toolu_1", { query: "沖縄" }], ["toolu_2", { query: "旅行" }]]);
    expect(started).toEqual(["search_notes", "search_notes"]);

    transcript.addStep(step, [{ toolCallId: "toolu_1", content: "1 件", isError: false }, { toolCallId: "toolu_2", content: "見つからない", isError: true }]);
    const final = await transcript.requestStep(request());
    expect(final).toMatchObject({ stopReason: "end", text: "2 件ありました。", toolCalls: [] });

    const second = requests[1]!;
    expect(second.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect((second.messages[1]!.content as Array<{ type: string; signature?: string }>).map((block) => block.type)).toEqual(["thinking", "text", "tool_use", "tool_use"]);
    expect((second.messages[1]!.content as Array<{ signature?: string }>)[0]!.signature).toBe("sig-1");
    expect(second.messages[2]!.content).toEqual([
      { type: "tool_result", tool_use_id: "toolu_1", content: "1 件", is_error: false },
      { type: "tool_result", tool_use_id: "toolu_2", content: "見つからない", is_error: true },
    ]);
    // ツールの一覧は会話の間変わらず、strict を付けず、入力は届いた分から送らせる。
    expect(second.tools).toEqual(requests[0]!.tools);
    expect(second.tools?.[0]).toMatchObject({ name: "search_notes", eager_input_streaming: true });
    expect(second.tools?.[0]).not.toHaveProperty("strict");
  });

  it("読めない入力の呼び出しは、入力を null にし、届いた文字を残す。上限で切れた答えは maxTokens にする", async () => {
    mockClaudeApi([[MESSAGE_START, ...toolUseBlock(0, "toolu_1", "search_notes", '{"query":"沖'), ...messageEnd("max_tokens")]]);
    const transcript = new ClaudeTranscript(connection, { system: "決まり", tools: TOOLS, previousMessages: [] });
    transcript.addUserMessage("探して");
    const step = await transcript.requestStep(request());
    expect(step.stopReason).toBe("maxTokens");
    expect(step.toolCalls).toEqual([{ id: "toolu_1", name: "search_notes", input: null, rawInput: '{"query":"沖' }]);
  });

  it("作り直す会話は文だけにし、文の無い答えを外して、続いた発言をまとめる。ツールの結果のあとの発言は、同じ user の発言に足す", async () => {
    const requests = mockClaudeApi([[MESSAGE_START, ...textBlock(0, "はい。"), ...messageEnd("end_turn")]]);
    const transcript = new ClaudeTranscript(connection, {
      system: "決まり", tools: TOOLS,
      previousMessages: [{ role: "user", text: "一" }, { role: "assistant", text: "" }, { role: "user", text: "二" }, { role: "assistant", text: "答え" }],
    });
    transcript.addUserMessage("三");
    await transcript.requestStep(request());
    expect(requests[0]!.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "一\n\n二" }] },
      { role: "assistant", content: [{ type: "text", text: "答え" }] },
      { role: "user", content: [{ type: "text", text: "三" }] },
    ]);

    const afterResults = new ClaudeTranscript(connection, { system: "決まり", tools: TOOLS, previousMessages: [] });
    afterResults.addUserMessage("探して");
    afterResults.addStep({ text: "", toolCalls: [], stopReason: "toolUse", answeredWithoutTools: false, answer: [{ type: "tool_use", id: "toolu_1", name: "search_notes", input: {} }] },
      [{ toolCallId: "toolu_1", content: "利用者が止めた", isError: true }]);
    afterResults.addUserMessage("続けて");
    const afterResultsRequests = mockClaudeApi([[MESSAGE_START, ...textBlock(0, "はい。"), ...messageEnd("end_turn")]]);
    await afterResults.requestStep(request());
    expect(afterResultsRequests[0]!.messages[2]).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "利用者が止めた", is_error: true }, { type: "text", text: "続けて" }],
    });
  });
});

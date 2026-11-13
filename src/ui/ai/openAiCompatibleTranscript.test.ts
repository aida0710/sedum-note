import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiStepRequest } from "./aiTranscript";
import { OpenAiCompatibleTranscript, streamLineContentOf, toolCallsOfFragments } from "./openAiCompatibleTranscript";

// 試験では OpenAI 互換のサーバーへつながない。fetch を差し替えて、届いた要求の本文を覚え、決まった答えを返す。

type SentRequest = { messages: Array<Record<string, unknown>>; tools?: unknown[] };
type MockAnswer = { status: number; lines?: object[] };

function mockServer(answers: MockAnswer[]): SentRequest[] {
  const requests: SentRequest[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)) as SentRequest);
    const answer = answers[requests.length - 1] ?? { status: 500 };
    if (answer.status !== 200) {
      return new Response("does not support tools", { status: answer.status });
    }
    const body = [...(answer.lines ?? []).map((line) => `data: ${JSON.stringify(line)}`), "data: [DONE]"].join("\n\n");
    return new Response(`${body}\n\n`, { headers: { "content-type": "text/event-stream" } });
  });
  return requests;
}

const textLine = (text: string) => ({ choices: [{ delta: { content: text } }] });
const finishLine = (finishReason: string) => ({ choices: [{ delta: {}, finish_reason: finishReason }] });
const toolCallLine = (index: number, part: { id?: string; name?: string; arguments: string }) => ({
  choices: [{ delta: { tool_calls: [{ index, ...(part.id ? { id: part.id } : {}), function: { ...(part.name ? { name: part.name } : {}), arguments: part.arguments } }] } }],
});

const connection = { baseUrl: "http://127.0.0.1:11434/v1/", apiKey: "", model: "local" };
const TOOLS = [{ name: "get_note", description: "Read", inputSchema: { type: "object", properties: { noteId: { type: "string" } } } }];
const request = (overrides: Partial<AiStepRequest> = {}): AiStepRequest => ({ onText: () => undefined, onToolCallStart: () => undefined, signal: new AbortController().signal, ...overrides });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAI 互換のストリームの 1 行", () => {
  it("答えの文字と、終わった理由を取り出す", () => {
    expect(streamLineContentOf('data: {"choices":[{"delta":{"content":"こんにちは"}}]}').text).toBe("こんにちは");
    expect(streamLineContentOf('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}').finishReason).toBe("tool_calls");
  });

  it("文字の無い行（役割だけの知らせ、終わりの印、空行、コメント、途中で切れた行）は、空にする", () => {
    for (const line of ['data: {"choices":[{"delta":{"role":"assistant"}}]}', "data: [DONE]", "", ": keep-alive", 'data: {"choices":[{"delta":{"content":"こん']) {
      expect(streamLineContentOf(line)).toEqual({ text: "", toolCallFragments: [], finishReason: null });
    }
  });

  it("index ごとの断片から、全部のツールの呼び出しを組み立てる。引数の JSON が切れていれば、入力を null にする", () => {
    const fragments = [
      toolCallLine(0, { id: "call-1", name: "get_note", arguments: '{"noteId":' }),
      toolCallLine(1, { id: "call-2", name: "get_note", arguments: '{"noteId":"b"}' }),
      toolCallLine(0, { arguments: '"a"}' }),
      toolCallLine(2, { name: "get_note", arguments: '{"noteId":"c' }),
    ].flatMap((line) => streamLineContentOf(`data: ${JSON.stringify(line)}`).toolCallFragments);
    expect(toolCallsOfFragments(fragments)).toEqual([
      { id: "call-1", name: "get_note", input: { noteId: "a" }, rawInput: '{"noteId":"a"}' },
      { id: "call-2", name: "get_note", input: { noteId: "b" }, rawInput: '{"noteId":"b"}' },
      { id: "call_2", name: "get_note", input: null, rawInput: '{"noteId":"c' },
    ]);
  });
});

describe("OpenAI 互換のサーバーへ送る会話", () => {
  it("答えは全部の tool_calls を持つ 1 つの発言にし、結果は呼び出しごとに role: \"tool\" の発言を並べる。上限で切れた答えは maxTokens", async () => {
    const requests = mockServer([
      { status: 200, lines: [toolCallLine(0, { id: "call-1", name: "get_note", arguments: '{"noteId":"a"}' }), toolCallLine(1, { id: "call-2", name: "get_note", arguments: '{"noteId":"b"}' }), finishLine("tool_calls")] },
      { status: 200, lines: [textLine("読みました"), finishLine("length")] },
    ]);
    const transcript = new OpenAiCompatibleTranscript(connection, { system: "決まり", tools: TOOLS, previousMessages: [] });
    transcript.addUserMessage("2 つ読んで");
    const step = await transcript.requestStep(request());
    expect(step.stopReason).toBe("toolUse");
    transcript.addStep(step, [{ toolCallId: "call-1", content: "本文 a", isError: false }, { toolCallId: "call-2", content: "there is no note", isError: true }]);
    const final = await transcript.requestStep(request());
    expect(final).toMatchObject({ stopReason: "maxTokens", text: "読みました" });
    expect(requests[1]!.messages.slice(1)).toEqual([
      { role: "user", content: "2 つ読んで" },
      { role: "assistant", content: null, tool_calls: [
        { id: "call-1", type: "function", function: { name: "get_note", arguments: '{"noteId":"a"}' } },
        { id: "call-2", type: "function", function: { name: "get_note", arguments: '{"noteId":"b"}' } },
      ] },
      { role: "tool", tool_call_id: "call-1", content: "本文 a" },
      { role: "tool", tool_call_id: "call-2", content: "Error: there is no note" },
    ]);
  });

  it("ツール付きの要求がまだ通っていない会話の 400 だけ、ツールを外して頼み直し、その会話ではツールを外したままにする", async () => {
    const requests = mockServer([{ status: 400 }, { status: 200, lines: [textLine("はい")] }, { status: 200, lines: [textLine("はい")] }]);
    const transcript = new OpenAiCompatibleTranscript(connection, { system: "決まり", tools: TOOLS, previousMessages: [] });
    transcript.addUserMessage("こんにちは");
    expect(await transcript.requestStep(request())).toMatchObject({ text: "はい", answeredWithoutTools: true });
    transcript.addUserMessage("もう一度");
    await transcript.requestStep(request());
    expect(requests.map((sent) => sent.tools !== undefined)).toEqual([true, false, false]);
  });

  it("ツール付きの要求が通ったあとの 400 は、ツールを外さずに失敗として出す", async () => {
    const requests = mockServer([{ status: 200, lines: [textLine("はい")] }, { status: 400 }]);
    const transcript = new OpenAiCompatibleTranscript(connection, { system: "決まり", tools: TOOLS, previousMessages: [] });
    transcript.addUserMessage("こんにちは");
    const step = await transcript.requestStep(request());
    transcript.addStep(step, []);
    transcript.addUserMessage("長い発言");
    await expect(transcript.requestStep(request())).rejects.toThrow("400");
    expect(requests).toHaveLength(2);
  });
});

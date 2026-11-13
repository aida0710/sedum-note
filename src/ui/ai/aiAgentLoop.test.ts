import { describe, expect, it } from "vitest";
import { runAgentTurn } from "./aiAgentLoop";
import type { AiStep, AiStepRequest, AiToolCall, AiToolResult, AiTranscript } from "./aiTranscript";

// つなぎ先の代わりに、決まった答えを順に返す会話。足された答えと結果を覚える。
type ScriptedStep = Omit<AiStep<string>, "answer" | "answeredWithoutTools"> & { answeredWithoutTools?: boolean } | ((request: AiStepRequest) => Promise<never>);

class ScriptedTranscript implements AiTranscript<string> {
  readonly added: Array<{ answer: string; results: AiToolResult[] }> = [];
  #next = 0;

  constructor(private readonly steps: ScriptedStep[]) {}

  addUserMessage(): void {}

  async requestStep(request: AiStepRequest): Promise<AiStep<string>> {
    const step = this.steps[this.#next];
    this.#next += 1;
    if (!step) {
      throw new Error("no more scripted steps");
    }
    if (typeof step === "function") {
      return step(request);
    }
    request.onText(step.text);
    return { answeredWithoutTools: false, ...step, answer: `answer-${this.#next}` };
  }

  addStep(step: AiStep<string>, results: AiToolResult[]): void {
    this.added.push({ answer: step.answer, results });
  }
}

const call = (id: string): AiToolCall => ({ id, name: "search_notes", input: {}, rawInput: "{}" });
const resultFor = (toolCalls: AiToolCall[]) => toolCalls.map((toolCall) => ({ toolCallId: toolCall.id, content: "ok", isError: false }));
const noCallback = { onText: () => undefined, onToolCallStart: () => undefined };

describe("1 回の発言のループ", () => {
  it("呼び出しのある答えの間は、結果をそろえて足して次を頼み、呼び出しの無い答えで終わる", async () => {
    const transcript = new ScriptedTranscript([
      { text: "探します。", toolCalls: [call("a"), call("b")], stopReason: "toolUse" },
      { text: "読みます。", toolCalls: [call("c")], stopReason: "toolUse" },
      { text: "終わりました。", toolCalls: [], stopReason: "end" },
    ]);
    const texts: string[] = [];
    const outcome = await runAgentTurn({ transcript, runToolCalls: async (toolCalls) => resultFor(toolCalls), signal: new AbortController().signal, ...noCallback, onText: (text) => texts.push(text) });
    expect(outcome).toEqual({ stopped: false, answeredWithoutTools: false });
    expect(transcript.added.map((added) => [added.answer, added.results.map((result) => result.toolCallId)])).toEqual([["answer-1", ["a", "b"]], ["answer-2", ["c"]], ["answer-3", []]]);
    expect(texts).toEqual(["探します。", "読みます。", "終わりました。"]);
  });

  it("受け取っている途中で止めると、その答えは足さずに止まる", async () => {
    const controller = new AbortController();
    const transcript = new ScriptedTranscript([
      { text: "探します。", toolCalls: [call("a")], stopReason: "toolUse" },
      async () => {
        controller.abort();
        throw new DOMException("stopped", "AbortError");
      },
    ]);
    const outcome = await runAgentTurn({ transcript, runToolCalls: async (toolCalls) => resultFor(toolCalls), signal: controller.signal, ...noCallback });
    expect(outcome.stopped).toBe(true);
    expect(transcript.added.map((added) => added.answer)).toEqual(["answer-1"]);
  });

  it("ツールの実行中に止めると、その答えと結果を足して止まり、次を頼まない", async () => {
    const controller = new AbortController();
    const transcript = new ScriptedTranscript([{ text: "", toolCalls: [call("a")], stopReason: "toolUse" }]);
    const outcome = await runAgentTurn({
      transcript, signal: controller.signal, ...noCallback,
      runToolCalls: async (toolCalls) => {
        controller.abort();
        return resultFor(toolCalls);
      },
    });
    expect(outcome.stopped).toBe(true);
    expect(transcript.added).toHaveLength(1);
  });

  it("上限で切れた答えと断られた答えは、ツールを動かさず、会話にも足さずに失敗にする", async () => {
    for (const stopReason of ["maxTokens", "refusal"] as const) {
      const transcript = new ScriptedTranscript([{ text: "", toolCalls: [call("a")], stopReason }]);
      let ran = false;
      await expect(runAgentTurn({ transcript, runToolCalls: async (toolCalls) => { ran = true; return resultFor(toolCalls); }, signal: new AbortController().signal, ...noCallback })).rejects.toThrow();
      expect(ran).toBe(false);
      expect(transcript.added).toEqual([]);
    }
  });

  it("つなぎ先の失敗は、そのまま投げる", async () => {
    const transcript = new ScriptedTranscript([async () => { throw new Error("401"); }]);
    await expect(runAgentTurn({ transcript, runToolCalls: async () => [], signal: new AbortController().signal, ...noCallback })).rejects.toThrow("401");
  });
});

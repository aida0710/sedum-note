// AI へ送る会話を、つなぎ先（Claude の API、OpenAI 互換）の形のまま持つ入れ物の決まりと、1 ステップの答えの形。
// 1 ステップは、つなぎ先への 1 回の要求と、その答え（文とツールの呼び出し）。ループ（aiAgentLoop.ts）は、答えに
// ツールの呼び出しがある間、結果を足して次のステップを頼む。
//
// 会話を開いている間は、送った形（添えたメモの本文、ツールの結果、Claude の thinking ブロック）を書き換えずに持ち、
// 次の要求にそのまま入れる。Claude の API は、前の答えを作り直すと、それより後の thinking ブロックを断ることがある。

import type { ToolArguments } from "../noteTools/noteTool";

// つなぎ先によらない、ツールの決まり。Claude と OpenAI 互換のどちらの形にも写す。
export type AiToolDefinition = { name: string; description: string; inputSchema: Record<string, unknown> };

// 答えの中の、ツールの呼び出しの 1 つ。input は、入力の JSON を読めなかった（途中で切れたなど）ときは null で、
// そのときは rawInput（届いた入力の文字のまま）を AI に返して呼び直させる。
export type AiToolCall = { id: string; name: string; input: ToolArguments | null; rawInput: string };

// ツールの呼び出しの結果。isError は、呼び出しが失敗した（引数が違う、許可していない、など）。
export type AiToolResult = { toolCallId: string; content: string; isError: boolean };

// 答えが終わった理由。toolUse はツールの呼び出しで止まった、end は答え終えた。maxTokens（答えの長さの上限で切れた）と
// refusal（断られた）のときは、ツールの入力が途中までのことがあるので、ツールを動かさない。
export type AiStopReason = "end" | "toolUse" | "maxTokens" | "refusal";

// 1 ステップの答え。answer はつなぎ先の形の答えで、会話に足すときにそのまま使う（ループは中を見ない）。
export type AiStep<Answer> = {
  text: string;
  toolCalls: AiToolCall[];
  stopReason: AiStopReason;
  // つなぎ先がツールを受け付けず、ツールを外して答えてもらった（OpenAI 互換のサーバーだけ）。
  answeredWithoutTools: boolean;
  answer: Answer;
};

export type AiStepRequest = {
  // 答えの文字が届くたびに、届いた分を渡す。
  onText: (text: string) => void;
  // ツールの呼び出しが始まったとき（入力が届き終わる前）に、ツールの名前を渡す。
  onToolCallStart: (toolName: string) => void;
  signal: AbortSignal;
};

export interface AiTranscript<Answer = unknown> {
  // 利用者の発言を足す。前の発言も利用者のもの（ツールの結果、止めた発言）なら、1 つの発言にまとめる。
  addUserMessage(content: string): void;
  // 今の会話で 1 ステップを頼む。会話には足さない（足すのは、全部の呼び出しの結果がそろってから addStep で）。
  requestStep(request: AiStepRequest): Promise<AiStep<Answer>>;
  // 答えと、その答えの全部の呼び出しの結果を、まとめて会話に足す。
  addStep(step: AiStep<Answer>, results: AiToolResult[]): void;
}

// 送った形が手元に無いとき（残した会話を開き直した、つなぎ先やモデルを変えた）に、会話を作り直すための、文だけの発言。
export type AiTextMessage = { role: "user" | "assistant"; text: string };

// 作り直す発言を、つなぎ先が受け付ける並びにする。文の無い答えは入れず（Claude は空の文を断る）、同じ側の発言が続けば
// 1 つにまとめる。
export function textMessagesForRebuild(messages: AiTextMessage[]): AiTextMessage[] {
  const merged: AiTextMessage[] = [];
  for (const message of messages) {
    if (message.text.trim() === "") {
      continue;
    }
    const last = merged[merged.length - 1];
    if (last?.role === message.role) {
      merged[merged.length - 1] = { role: last.role, text: `${last.text}\n\n${message.text}` };
    } else {
      merged.push(message);
    }
  }
  return merged;
}

// ツールの入力の JSON を、決まりどおりに読む。入力の無いツールは、空の入力が届くことがある。
// 読めない、またはオブジェクトでなければ null（SDK の寛容な読み方は、壊れた入力を黙って途中で切ることがあるため、
// 届いた文字を自分で読み直す）。
export function toolArgumentsOf(rawInput: string): ToolArguments | null {
  if (rawInput.trim() === "") {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(rawInput);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as ToolArguments) : null;
  } catch {
    return null;
  }
}

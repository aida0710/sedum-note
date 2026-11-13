// アプリ内の AI の 1 回の発言の流れ（ループ）。つなぎ先に 1 ステップずつ頼み、答えにツールの呼び出しがあれば、
// 全部の結果をそろえて会話に足し、次のステップを頼む。呼び出しの無い答えが来たら終わる。
// 1 回の発言で頼むステップの数に上限は置かない。止めるボタン（signal）が歯止めで、受信中・承認待ち・ツールの実行中の
// どこでも止まる。止めたあとも、会話に足した答えの呼び出しには、必ず結果が付いている。
//
// 画面（React）にも、つなぎ先の SDK にもよらない（つなぎ先の形は aiTranscript.ts の入れ物が持つ）。

import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import type { AiStepRequest, AiTranscript } from "./aiTranscript";
import type { ToolCallRunner } from "./aiToolCalls";

export type AgentTurnInput = Omit<AiStepRequest, "signal"> & {
  transcript: AiTranscript;
  runToolCalls: ToolCallRunner;
  signal: AbortSignal;
};

// stopped は、利用者が止めた。answeredWithoutTools は、つなぎ先がツールを受け付けず、ツールなしで答えてもらった。
export type AgentTurnOutcome = { stopped: boolean; answeredWithoutTools: boolean };

export async function runAgentTurn({ transcript, runToolCalls, onText, onToolCallStart, signal }: AgentTurnInput): Promise<AgentTurnOutcome> {
  let answeredWithoutTools = false;
  for (;;) {
    let step;
    try {
      step = await transcript.requestStep({ onText, onToolCallStart, signal });
    } catch (error) {
      // 受け取っている途中で止めた答えは、会話に足さない（その答えの呼び出しは、まだ AI に返していない）。
      if (signal.aborted) {
        return { stopped: true, answeredWithoutTools };
      }
      throw error;
    }
    answeredWithoutTools ||= step.answeredWithoutTools;
    // 上限で切れた答えと断られた答えは、ツールの入力が途中までのことがあるので、ツールを動かさない。
    if (step.stopReason === "maxTokens") {
      throw new UserFacingError(translate("ai.error.truncated"));
    }
    if (step.stopReason === "refusal") {
      throw new UserFacingError(translate("ai.error.refused"));
    }
    if (step.toolCalls.length === 0) {
      transcript.addStep(step, []);
      return { stopped: false, answeredWithoutTools };
    }
    const results = await runToolCalls(step.toolCalls, signal);
    transcript.addStep(step, results);
    if (signal.aborted) {
      return { stopped: true, answeredWithoutTools };
    }
  }
}

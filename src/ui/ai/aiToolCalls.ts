// AI の 1 つの答え（1 ステップ）に入っていた、全部のツールの呼び出しを処理して、呼び出しごとに 1 つの結果を返す。
// 設定の許可（種類ごとに、許可しない・毎回聞く・聞かずに行う）に従い、聞く呼び出しは 1 枚の承認にまとめて待つ。
//
// どんな失敗でも例外にせず、失敗した結果にする（入れ終えた変更を AI に伝えないまま、その答えを捨てないため）。
// 止められたら、まだ動かしていない呼び出しには「止めた」の結果を付ける（結果の無い呼び出しを含む会話は断られる）。

import type { AiToolPermissions } from "../../core/vault/aiSettings";
import type { BodyChangeProposal } from "../noteTools/noteBodyChange";
import { type NoteTool, NoteToolError, type NoteToolPreview, type PreparedNoteToolCall } from "../noteTools/noteTool";
import type { AiToolCall, AiToolResult } from "./aiTranscript";

// 承認を求める 1 件。bodyChange は、本文の差し替えの差分（カードで前と後を見せる）。
export type AiApprovalItem = { toolCallId: string; toolName: string; preview: NoteToolPreview; bodyChange: BodyChangeProposal | null };

// 承認を求め、承認された呼び出しの ID を返す。止められたら（signal）、何も承認しなかったことにして返す。
export type RequestApproval = (items: AiApprovalItem[], signal: AbortSignal) => Promise<ReadonlySet<string>>;

// 会話の中に出す、呼び出しの様子。
//   running: 動かしている。awaitingApproval: 承認を待っている。done: 済んだ。failed: 失敗した（引数の誤りなど）。
//   denied: 設定で許可していない。rejected: 利用者が承認しなかった。stale: 承認を待つ間に対象が変わった。stopped: 止めたので動かさなかった。
export type AiToolActivityStatus = "running" | "awaitingApproval" | "done" | "failed" | "denied" | "rejected" | "stale" | "stopped";

// 結果から拾う、会話に出す手がかり。noteId は、押すと開けるメモ（作った・読んだ・直したメモ）。count は、見つかった件数。
export type AiToolResultSummary = { noteId?: string; count?: number };

export type AiToolActivity = {
  toolCallId: string;
  toolName: string;
  // 呼び出しの中身（準備できなかったときは null）。
  preview: NoteToolPreview | null;
  status: AiToolActivityStatus;
  resultSummary?: AiToolResultSummary;
};

type ToolCallRunnerInput = {
  tools: readonly NoteTool[];
  // 呼び出しの時点の許可（会話の途中で設定を変えたら、次のステップから効く）。
  permissions: () => AiToolPermissions;
  requestApproval: RequestApproval;
  onActivity: (activity: AiToolActivity) => void;
};

// AI に返す、動かさなかった呼び出しの結果。
const STOPPED_RESULT = "The user stopped the conversation before this call ran. Nothing was changed.";
const REJECTED_RESULT = "The user did not approve this call. Nothing was changed.";
const STALE_RESULT = "The target changed while the user was reviewing this call, so it was not run. Nothing was changed. Read it again and retry if still needed.";

// 準備まで済んだ呼び出し。outcome があれば、動かさずにその結果を返す。
type PlannedCall =
  | { call: AiToolCall; outcome: AiToolResult }
  | { call: AiToolCall; prepared: PreparedNoteToolCall; asks: boolean };

function errorResult(call: AiToolCall, content: string): AiToolResult {
  return { toolCallId: call.id, content, isError: true };
}

function messageOf(error: unknown): string {
  if (error instanceof NoteToolError) {
    return error.message;
  }
  return `the tool failed: ${error instanceof Error ? error.message : String(error)}`;
}

function summaryOfResult(result: unknown): AiToolResultSummary {
  if (typeof result !== "object" || result === null) {
    return {};
  }
  const { noteId, totalCount } = result as Record<string, unknown>;
  return { ...(typeof noteId === "string" ? { noteId } : {}), ...(typeof totalCount === "number" ? { count: totalCount } : {}) };
}

// 止められるまで承認を待つ。止められたら、何も承認しなかったことにする。
function approvalUntilStopped(requestApproval: RequestApproval, items: AiApprovalItem[], signal: AbortSignal): Promise<ReadonlySet<string>> {
  const none: ReadonlySet<string> = new Set();
  if (signal.aborted) {
    return Promise.resolve(none);
  }
  const stopped = new Promise<ReadonlySet<string>>((resolve) => signal.addEventListener("abort", () => resolve(none), { once: true }));
  return Promise.race([requestApproval(items, signal).catch(() => none), stopped]);
}

export function createToolCallRunner({ tools, permissions, requestApproval, onActivity }: ToolCallRunnerInput) {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

  // 準備できずに終わった呼び出し。会話に様子を出し、失敗した結果にする。
  const unprepared = (call: AiToolCall, status: "failed" | "denied", content: string): PlannedCall => {
    onActivity({ toolCallId: call.id, toolName: call.name, preview: null, status });
    return { call, outcome: errorResult(call, content) };
  };

  const plan = async (call: AiToolCall): Promise<PlannedCall> => {
    const tool = toolsByName.get(call.name);
    if (!tool) {
      return unprepared(call, "failed", `there is no tool named ${call.name}`);
    }
    if (call.input === null) {
      return unprepared(call, "failed", JSON.stringify({ INVALID_JSON: call.rawInput }));
    }
    const permission = permissions()[tool.category];
    if (permission === "deny") {
      return unprepared(call, "denied", `the user does not allow this kind of operation (${tool.category}) in the app's settings`);
    }
    try {
      return { call, prepared: await tool.prepare(call.input), asks: permission === "ask" };
    } catch (error) {
      return unprepared(call, "failed", messageOf(error));
    }
  };

  const run = async (planned: PlannedCall, approved: ReadonlySet<string>, signal: AbortSignal): Promise<AiToolResult> => {
    if ("outcome" in planned) {
      return planned.outcome;
    }
    const { call, prepared, asks } = planned;
    const activity = (status: AiToolActivityStatus, resultSummary?: AiToolResultSummary) =>
      onActivity({ toolCallId: call.id, toolName: call.name, preview: prepared.preview, status, ...(resultSummary ? { resultSummary } : {}) });
    if (signal.aborted) {
      activity("stopped");
      return errorResult(call, STOPPED_RESULT);
    }
    if (asks && !approved.has(call.id)) {
      activity("rejected");
      return errorResult(call, REJECTED_RESULT);
    }
    if (!prepared.isCurrent()) {
      activity("stale");
      return errorResult(call, STALE_RESULT);
    }
    activity("running");
    try {
      const result = await prepared.run();
      activity("done", summaryOfResult(result));
      return { toolCallId: call.id, content: JSON.stringify(result), isError: false };
    } catch (error) {
      activity("failed");
      return errorResult(call, messageOf(error));
    }
  };

  // 呼び出しの順に準備し、聞くものをまとめて承認を待ってから、順に動かす（1 件のツールは途中で切らない）。
  return async (toolCalls: AiToolCall[], signal: AbortSignal): Promise<AiToolResult[]> => {
    const planned: PlannedCall[] = [];
    for (const call of toolCalls) {
      planned.push(signal.aborted ? { call, outcome: errorResult(call, STOPPED_RESULT) } : await plan(call));
    }
    const approvalItems = planned.flatMap((entry): AiApprovalItem[] => ("prepared" in entry && entry.asks
      ? [{ toolCallId: entry.call.id, toolName: entry.call.name, preview: entry.prepared.preview, bodyChange: entry.prepared.bodyChange ?? null }]
      : []));
    for (const item of approvalItems) {
      onActivity({ toolCallId: item.toolCallId, toolName: item.toolName, preview: item.preview, status: "awaitingApproval" });
    }
    const approved = approvalItems.length === 0 ? new Set<string>() : await approvalUntilStopped(requestApproval, approvalItems, signal);
    const results: AiToolResult[] = [];
    for (const entry of planned) {
      results.push(await run(entry, approved, signal));
    }
    return results;
  };
}

export type ToolCallRunner = ReturnType<typeof createToolCallRunner>;

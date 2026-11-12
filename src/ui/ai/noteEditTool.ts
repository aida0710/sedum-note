// AI に渡す道具（ツール）: 開いているメモの直しの案を出す。AI はメモを直接は書き換えない。案は画面に差分で出し、
// 利用者が承認したときだけ適用する（承認を待たずに適用する設定もある）。

// つなぎ先によらない、道具の決まり。Claude と OpenAI 互換のどちらの形にも写す。
export type AiToolDefinition = { name: string; description: string; inputSchema: Record<string, unknown> };

// 道具の呼び出し（AI の答えの中の 1 つ）。
export type AiToolCall = { id: string; name: string; input: unknown };

export const NOTE_EDIT_TOOL: AiToolDefinition = {
  name: "propose_note_edit",
  description: [
    "Propose a change to the open note (the <note> tag with open=\"true\"). The user sees the change as a diff and decides whether to apply it; nothing changes until they do.",
    "Call this tool whenever the user asks you to change, fix, rewrite, translate, reorganize or add to the open note, instead of writing the new text in your answer.",
    "Pass the complete new body of the note in Markdown, not only the changed part. Copy every part you are not asked to change exactly as it is, including links (sedum-note://...), attachment links, and block markers at the end of lines (^id).",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      markdown: { type: "string", description: "The complete new body of the open note, in Markdown." },
      summary: { type: "string", description: "One short sentence, in the user's language, saying what the change does." },
    },
    required: ["markdown", "summary"],
    additionalProperties: false,
  },
};

export type NoteEditInput = { markdown: string; summary: string };

// 道具の呼び出しの入力が、決まりどおりか確かめる。途中で切れた入力（答えの長さの上限など）は null。
export function noteEditInputOf(call: AiToolCall): NoteEditInput | null {
  if (call.name !== NOTE_EDIT_TOOL.name || typeof call.input !== "object" || call.input === null) {
    return null;
  }
  const { markdown, summary } = call.input as Record<string, unknown>;
  return typeof markdown === "string" && typeof summary === "string" ? { markdown, summary } : null;
}

// 直しの案が、その後どうなったか。proposed は、まだ決めていない。stale は、案を作ったあとでメモが変わって使えなくなった。
export type NoteEditStatus = "proposed" | "applied" | "rejected" | "stale";

// 次の発言で AI に伝える、案の行方。
export function noteEditResultText(status: NoteEditStatus): string {
  switch (status) {
    case "applied":
      return "The user applied the edit. The open note now contains it.";
    case "rejected":
      return "The user rejected the edit. The note was not changed.";
    case "stale":
      return "The edit could not be applied because the note changed after you proposed it. The note was not changed.";
    case "proposed":
      return "The user has not applied the edit yet. The note was not changed.";
  }
}

// 前の発言の道具の呼び出しを送り直すときの入力。本文の案は、もう一度送らない（長く、同じ会話の中で今の本文も添えるため）。
export function noteEditInputForHistory(summary: string): NoteEditInput {
  return { markdown: "(omitted from the history)", summary };
}

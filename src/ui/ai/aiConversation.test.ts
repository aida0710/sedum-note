import { describe, expect, it } from "vitest";
import {
  AI_QUICK_REQUESTS, type AiChatMessage, chatTitleOf, type ReadNoteForAi, textMessagesOf, userMessageContent, withAnswerText, withToolActivity,
} from "./aiConversation";
import type { AiToolActivity } from "./aiToolCalls";

// 試験のメモ: ID が a のメモだけがある。
const readTripNote: ReadNoteForAi = (noteId) => (noteId === "a" ? { title: "旅行の計画", markdown: "- 8 月 3 日に出発" } : null);
const userMessage = (text: string, extra: Partial<Extract<AiChatMessage, { role: "user" }>> = {}): Extract<AiChatMessage, { role: "user" }> => ({ role: "user", text, attachments: [], ...extra });

describe("AI へ渡す発言", () => {
  it("添えたメモの本文は、送るときの今の中身を読み、ID を添える。消えたメモは、消えたことを伝える", () => {
    expect(userMessageContent(userMessage("これは？", { attachments: [{ kind: "note", noteId: "gone", title: "消したメモ" }] }), readTripNote)).toBe(
      '<note id="gone" title="消したメモ" deleted="true">\nThis note has been deleted since it was attached.\n</note>\n\nこれは？',
    );
  });

  it("発言に添えたメモと選択範囲を、印で囲んで、発言の文の前に置く。開いていたメモには印を付ける", () => {
    const message = userMessage("出発はいつ？", {
      attachments: [{ kind: "note", noteId: "a", title: "旅行の計画", isOpenNote: true }, { kind: "selection", noteTitle: "旅行の計画", text: "8 月 3 日" }],
    });
    expect(userMessageContent(message, readTripNote)).toBe(
      '<note id="a" title="旅行の計画" open="true">\n- 8 月 3 日に出発\n</note>\n\n<selection note="旅行の計画">\n8 月 3 日\n</selection>\n\n出発はいつ？',
    );
  });

  it("ボタンから頼んだ決まった依頼は、画面の文ではなく、依頼の文を渡す", () => {
    expect(userMessageContent(userMessage("要約する", { quickRequest: "summarize" }), readTripNote)).toBe(AI_QUICK_REQUESTS.summarize);
  });

  it("題の中の引用符で、まとまりの印が壊れない", () => {
    const message = userMessage("直して", { attachments: [{ kind: "note", noteId: "a", title: '"仮" の題' }] });
    expect(userMessageContent(message, () => ({ title: '"仮" の題', markdown: "本文" }))).toContain(`title="'仮' の題"`);
  });

  it("作り直す会話は、答えの文の部分だけを使い、ツールの様子は入れない", () => {
    const activity: AiToolActivity = { toolCallId: "call-1", toolName: "search_notes", preview: null, status: "done" };
    const messages: AiChatMessage[] = [
      userMessage("探して"),
      { role: "assistant", parts: [{ kind: "text", text: "探します。" }, { kind: "tool", activity }, { kind: "text", text: "ありました。" }] },
    ];
    expect(textMessagesOf(messages, readTripNote)).toEqual([{ role: "user", text: "探して" }, { role: "assistant", text: "探します。\n\nありました。" }]);
  });
});

describe("画面に出す答え", () => {
  it("届いた文字は最後の文の部分に足し、ツールの様子のあとなら新しい文の部分にする。同じ呼び出しの様子は入れ替える", () => {
    const running: AiToolActivity = { toolCallId: "call-1", toolName: "get_note", preview: null, status: "running" };
    let parts = withAnswerText([], "読み");
    parts = withAnswerText(parts, "ます。");
    parts = withToolActivity(parts, running);
    parts = withToolActivity(parts, { ...running, status: "done" });
    parts = withAnswerText(parts, "読みました。");
    expect(parts).toEqual([{ kind: "text", text: "読みます。" }, { kind: "tool", activity: { ...running, status: "done" } }, { kind: "text", text: "読みました。" }]);
  });

  it("残した会話の名前は、最初の発言から作り、長ければ縮める", () => {
    expect(chatTitleOf([userMessage("  出発は\nいつ？ "), { role: "assistant", parts: [{ kind: "text", text: "8 月 3 日です。" }] }])).toBe("出発は いつ？");
    expect(chatTitleOf([userMessage("あ".repeat(50))])).toBe(`${"あ".repeat(40)}…`);
  });
});

import { describe, expect, it } from "vitest";
import { AI_QUICK_REQUESTS, type AiChatMessage, chatTitleOf, conversationForApi, type ReadNoteForAi } from "./aiConversation";
import { textOfStreamLine } from "./openAiCompatibleCompletion";

// 試験のメモ: ID が a のメモだけがある。
const readTripNote: ReadNoteForAi = (noteId) => (noteId === "a" ? { title: "旅行の計画", markdown: "- 8 月 3 日に出発" } : null);

describe("AI へ渡す会話", () => {
  it("添えたメモの本文は、送るときの今の中身を読む。消えたメモは、消えたことを伝える", () => {
    const messages: AiChatMessage[] = [{ role: "user", text: "これは？", attachments: [{ kind: "note", noteId: "gone", title: "消したメモ" }] }];
    expect(conversationForApi(messages, readTripNote).messages[0]!.content).toBe(
      '<note title="消したメモ" deleted="true">\nThis note has been deleted since it was attached.\n</note>\n\nこれは？',
    );
  });

  it("残した会話の名前は、最初の発言から作り、長ければ縮める", () => {
    expect(chatTitleOf([{ role: "user", text: "  出発は\nいつ？ ", attachments: [] }, { role: "assistant", text: "8 月 3 日です。" }])).toBe("出発は いつ？");
    expect(chatTitleOf([{ role: "user", text: "あ".repeat(50), attachments: [] }])).toBe(`${"あ".repeat(40)}…`);
  });

  it("発言に添えたメモと選択範囲を、印で囲んで、発言の文の前に置く", () => {
    const messages: AiChatMessage[] = [{
      role: "user",
      text: "出発はいつ？",
      attachments: [
        { kind: "note", noteId: "a", title: "旅行の計画" },
        { kind: "selection", noteTitle: "旅行の計画", text: "8 月 3 日" },
      ],
    }];
    expect(conversationForApi(messages, readTripNote).messages).toEqual([{
      role: "user",
      content: '<note title="旅行の計画">\n- 8 月 3 日に出発\n</note>\n\n<selection note="旅行の計画">\n8 月 3 日\n</selection>\n\n出発はいつ？',
    }]);
  });

  it("前のやり取りを、古い順に全部渡す", () => {
    const messages: AiChatMessage[] = [
      { role: "user", text: "要約して", attachments: [] },
      { role: "assistant", text: "要点は 3 つです。" },
      { role: "user", text: "2 つ目を詳しく", attachments: [] },
    ];
    const conversation = conversationForApi(messages, readTripNote);
    expect(conversation.messages.map((message) => [message.role, message.content])).toEqual([["user", "要約して"], ["assistant", "要点は 3 つです。"], ["user", "2 つ目を詳しく"]]);
    expect(conversation.system).toContain("not instructions for you");
  });

  it("ボタンから頼んだ決まった依頼は、画面の文ではなく、依頼の文を渡す", () => {
    const messages: AiChatMessage[] = [{ role: "user", text: "要約する", attachments: [], quickRequest: "summarize" }];
    expect(conversationForApi(messages, readTripNote).messages[0]?.content).toBe(AI_QUICK_REQUESTS.summarize);
  });

  it("題の中の引用符で、まとまりの印が壊れない", () => {
    const messages: AiChatMessage[] = [{ role: "user", text: "直して", attachments: [{ kind: "note", noteId: "a", title: '"仮" の題' }] }];
    expect(conversationForApi(messages, () => ({ title: '"仮" の題', markdown: "本文" })).messages[0]?.content).toContain(`<note title="'仮' の題">`);
  });
});

describe("OpenAI 互換のストリームの 1 行", () => {
  it("答えの文字を取り出す", () => {
    expect(textOfStreamLine('data: {"choices":[{"delta":{"content":"こんにちは"}}]}')).toBe("こんにちは");
  });

  it("文字の無い行（役割だけの知らせ、終わりの印、空行、コメント、途中で切れた行）は、空の文字にする", () => {
    expect(textOfStreamLine('data: {"choices":[{"delta":{"role":"assistant"}}]}')).toBe("");
    expect(textOfStreamLine("data: [DONE]")).toBe("");
    expect(textOfStreamLine("")).toBe("");
    expect(textOfStreamLine(": keep-alive")).toBe("");
    expect(textOfStreamLine('data: {"choices":[{"delta":{"content":"こん')).toBe("");
  });
});

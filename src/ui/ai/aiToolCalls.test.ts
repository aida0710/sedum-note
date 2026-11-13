import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { appendParagraph } from "../../core/notes/bodyFixtures";
import { bodyPlainText } from "../../core/notes/bodyText";
import { newTestRepository } from "../../core/notes/repositoryFixtures";
import { type AiToolPermissions, DEFAULT_AI_TOOL_PERMISSIONS } from "../../core/vault/aiSettings";
import { AiKnownNoteBodies, createChatNoteTools } from "./aiChatNoteTools";
import { type AiApprovalItem, type AiToolActivity, createToolCallRunner, type RequestApproval } from "./aiToolCalls";
import type { AiToolCall } from "./aiTranscript";

let callCount = 0;
const toolCall = (name: string, input: Record<string, unknown> | null): AiToolCall => {
  callCount += 1;
  return { id: `call-${callCount}`, name, input, rawInput: input === null ? '{"noteId":' : JSON.stringify(input) };
};

type RunnerSetup = { permissions?: Partial<AiToolPermissions>; approve?: RequestApproval };

async function runnerOver({ permissions = {}, approve = async () => new Set() }: RunnerSetup = {}) {
  const { repository } = await newTestRepository();
  const knownBodies = new AiKnownNoteBodies();
  const activities: AiToolActivity[] = [];
  const approvals: AiApprovalItem[][] = [];
  const runToolCalls = createToolCallRunner({
    tools: createChatNoteTools(repository, knownBodies),
    permissions: () => ({ ...DEFAULT_AI_TOOL_PERMISSIONS, ...permissions }),
    requestApproval: (items, signal) => {
      approvals.push(items);
      return approve(items, signal);
    },
    onActivity: (activity) => activities.push(activity),
  });
  const lastStatusOf = (toolCallId: string) => activities.filter((activity) => activity.toolCallId === toolCallId).at(-1)?.status;
  return { repository, knownBodies, runToolCalls, activities, approvals, lastStatusOf };
}

const approveAll: RequestApproval = async (items) => new Set(items.map((item) => item.toolCallId));
const parsed = (content: string) => JSON.parse(content) as Record<string, unknown>;

describe("1 つの答えのツールの呼び出し", () => {
  it("読むのは聞かずに動かし、変えるのは 1 枚の承認にまとめて、承認したものだけを動かす。結果は呼び出しの順に 1 つずつ返す", async () => {
    const { repository, runToolCalls, approvals, lastStatusOf } = await runnerOver({ approve: async (items) => new Set([items[0]!.toolCallId]) });
    const search = toolCall("search_notes", {});
    const created = toolCall("create_note", { title: "作るメモ" });
    const notCreated = toolCall("create_note", { title: "作らないメモ" });
    const results = await runToolCalls([search, created, notCreated], new AbortController().signal);
    expect(results.map((result) => [result.toolCallId, result.isError])).toEqual([[search.id, false], [created.id, false], [notCreated.id, true]]);
    expect(parsed(results[0]!.content)).toMatchObject({ totalCount: 0 });
    expect(approvals.map((items) => items.map((item) => item.toolCallId))).toEqual([[created.id, notCreated.id]]);
    expect(repository.notes().map((note) => note.content.title)).toEqual(["作るメモ"]);
    expect([lastStatusOf(search.id), lastStatusOf(created.id), lastStatusOf(notCreated.id)]).toEqual(["done", "done", "rejected"]);
  });

  it("読むのも毎回聞く設定なら、検索や読み取りも承認を待ち、承認しなければ動かさない", async () => {
    const { runToolCalls, approvals, lastStatusOf } = await runnerOver({ permissions: { read: "ask" } });
    const search = toolCall("search_notes", {});
    const [rejected] = await runToolCalls([search], new AbortController().signal);
    expect(approvals.map((items) => items.map((item) => item.preview.kind))).toEqual([["searchNotes"]]);
    expect(rejected).toMatchObject({ isError: true });
    expect(rejected!.content).toContain("did not approve");
    expect(lastStatusOf(search.id)).toBe("rejected");
  });

  it("設定で許可していない種類と、読めない入力と、無いツールは、動かさずに失敗の結果にする", async () => {
    const { repository, runToolCalls, approvals } = await runnerOver({ permissions: { edit: "deny" } });
    const results = await runToolCalls([toolCall("create_note", { title: "作らない" }), toolCall("get_note", null), toolCall("no_such_tool", {})], new AbortController().signal);
    expect(results.every((result) => result.isError)).toBe(true);
    expect(results[0]!.content).toContain("does not allow");
    expect(parsed(results[1]!.content)).toEqual({ INVALID_JSON: '{"noteId":' });
    expect(results[2]!.content).toContain("no tool named no_such_tool");
    expect(approvals).toEqual([]);
    expect(repository.notes()).toEqual([]);
  });

  it("承認を待っている間に止めると、何も変えず、全部の呼び出しに「止めた」の結果を付ける", async () => {
    const controller = new AbortController();
    const { repository, runToolCalls, lastStatusOf } = await runnerOver({
      approve: () => {
        controller.abort();
        return new Promise(() => undefined);
      },
    });
    const calls = [toolCall("search_notes", {}), toolCall("create_note", { title: "作らない" })];
    const results = await runToolCalls(calls, controller.signal);
    expect(results.map((result) => [result.toolCallId, result.isError, result.content.includes("stopped")])).toEqual([[calls[0]!.id, true, true], [calls[1]!.id, true, true]]);
    expect(repository.notes()).toEqual([]);
    expect(lastStatusOf(calls[1]!.id)).toBe("stopped");
  });

  it("承認を待つ間に本文が変わった差し替えは、動かさずに stale の結果にする", async () => {
    let editWhileWaiting = () => undefined as void;
    const { repository, runToolCalls, lastStatusOf } = await runnerOver({
      approve: async (items) => {
        editWhileWaiting();
        return approveAll(items, new AbortController().signal);
      },
    });
    const note = await repository.createNote({ title: "メモ" });
    appendParagraph(note.body, "元の文");
    await runToolCalls([toolCall("get_note", { noteId: note.id })], new AbortController().signal);
    editWhileWaiting = () => appendParagraph(note.body, "利用者が足した文");
    const replace = toolCall("replace_note_body", { noteId: note.id, markdown: "AI の文\n" });
    const [result] = await runToolCalls([replace], new AbortController().signal);
    expect(result).toMatchObject({ isError: true });
    expect(lastStatusOf(replace.id)).toBe("stale");
    expect(bodyPlainText(note.body)).toContain("利用者が足した文");
  });
});

describe("チャットだけの、本文の差し替えの決まり", () => {
  it("AI が本文の全体を読んでいないメモと、読んだあとで変わったメモの差し替えは断る。読み直せば差し替えられる", async () => {
    const { repository, runToolCalls } = await runnerOver({ permissions: { edit: "allow" } });
    const note = await repository.createNote({ title: "メモ" });
    appendParagraph(note.body, "元の文");
    const signal = new AbortController().signal;
    const replace = () => runToolCalls([toolCall("replace_note_body", { noteId: note.id, markdown: "AI の文\n" })], signal);

    expect((await replace())[0]!.content).toContain("read the whole note with get_note");
    await runToolCalls([toolCall("get_note", { noteId: note.id })], signal);
    appendParagraph(note.body, "利用者が足した文");
    expect((await replace())[0]!.content).toContain("changed after you last read it");
    await runToolCalls([toolCall("get_note", { noteId: note.id })], signal);
    expect((await replace())[0]!.isError).toBe(false);
    expect(bodyPlainText(note.body)).toBe("AI の文");
    // 自分で書いたあとは、読み直さずに続けて直せる。
    expect((await runToolCalls([toolCall("replace_note_body", { noteId: note.id, markdown: "AI の文をさらに直した\n" })], signal))[0]!.isError).toBe(false);
  });

  it("長いメモは一部ずつ返し、一部しか読んでいないメモの差し替えは断る", async () => {
    const { repository, runToolCalls } = await runnerOver({ permissions: { edit: "allow" } });
    const note = await repository.createNote({ title: "長いメモ" });
    appendParagraph(note.body, "あ".repeat(40_000));
    const signal = new AbortController().signal;
    const [first] = await runToolCalls([toolCall("get_note", { noteId: note.id, maxCharacters: 50_000 })], signal);
    expect(parsed(first!.content)).toMatchObject({ truncated: true, nextOffset: 30_000 });
    expect(parsed(first!.content).totalCharacters).toBeGreaterThan(40_000);
    const [rest] = await runToolCalls([toolCall("get_note", { noteId: note.id, offset: 30_000 })], signal);
    expect(parsed(rest!.content)).toMatchObject({ truncated: false, offset: 30_000 });
    const [replaced] = await runToolCalls([toolCall("replace_note_body", { noteId: note.id, markdown: "短く\n" })], signal);
    expect(replaced!.content).toContain("read the whole note with get_note");
  });
});

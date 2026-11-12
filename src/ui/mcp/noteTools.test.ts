import { blockLineText, ensureBlockId, findBlock, linkableBlocks } from "../../core/notes/bodyBlocks";
import "fake-indexeddb/auto";
import { prosemirrorJSONToYXmlFragment } from "@tiptap/y-tiptap";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { McpTool } from "../../core/mcp/mcpServer";
import { appendAttachmentFile, appendAttachmentImage, appendParagraph } from "../../core/notes/bodyFixtures";
import { bodyPlainText } from "../../core/notes/bodyText";
import type { NoteRepository } from "../../core/notes/noteRepository";
import { newTestRepository } from "../../core/notes/repositoryFixtures";
import { documentSchema } from "../editor/documentSchema";
import { createNoteTools } from "./noteTools";

async function toolsOver(allowPermanentDelete = false): Promise<{ repository: NoteRepository; run: (name: string, toolArguments?: Record<string, unknown>) => Promise<any> }> {
  const { repository } = await newTestRepository();
  const tools = createNoteTools(repository, { allowPermanentDelete });
  const run = async (name: string, toolArguments: Record<string, unknown> = {}) => {
    const tool: McpTool | undefined = tools.find((candidate) => candidate.name === name);
    if (!tool) {
      throw new Error(`no tool ${name}`);
    }
    return tool.run(toolArguments);
  };
  return { repository, run };
}

describe("MCP のメモのツール", () => {
  it("メモを作り、検索して、Markdown で読める", async () => {
    const { run } = await toolsOver();
    const { notebookId } = await run("create_notebook", { name: "旅行" });
    const created = await run("create_note", { title: "沖縄", markdown: "## 持ち物\n\n- [ ] 日焼け止め #todo\n", notebookIds: [notebookId] });
    const found = await run("search_notes", { query: "日焼け止め" });
    expect(found.notes.map((note: { noteId: string; title: string; tags: string[] }) => [note.noteId, note.title, note.tags])).toEqual([[created.noteId, "沖縄", ["todo"]]]);
    expect((await run("search_notes", { notebookId })).totalCount).toBe(1);
    expect((await run("search_notes", { tag: "todo" })).totalCount).toBe(1);
    expect((await run("search_notes", { query: "無い言葉" })).totalCount).toBe(0);
    const read = await run("get_note", { noteId: created.noteId });
    expect(read.markdown).toContain("## 持ち物");
    expect(read.markdown).toContain("- [ ] 日焼け止め #todo");
    expect((await run("list_notebooks")).notebooks).toEqual([{ notebookId, name: "旅行", noteCount: 1, children: [] }]);
    expect((await run("list_tags")).tags).toEqual([{ tag: "todo", count: 1 }]);
  });

  it("読んだ Markdown をそのまま書き戻しても、写真・メモへのリンク・表・ブロックの ID が本文に残る", async () => {
    const { repository, run } = await toolsOver();
    const linked = await repository.createNote({ title: "リンク先" });
    const note = await repository.createNote({ title: "議事録" });
    const photo = await repository.storeAttachment({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png", fileName: "board (1).png" });
    appendParagraph(note.body, "決まったこと");
    const blockId = ensureBlockId(linkableBlocks(note.body)[0]!.element);
    appendAttachmentImage(note.body, photo);
    await run("append_to_note", { noteId: note.id, markdown: `[リンク先](sedum-note://note/${linked.id})\n\n| a | b |\n|---|---|\n| 1 | 2 |\n` });

    const before = (await run("get_note", { noteId: note.id })).markdown;
    expect(before).toContain(`![board (1).png](sedum-note://attachment/${photo.id})`);
    await run("replace_note_body", { noteId: note.id, markdown: before });
    const after = await run("get_note", { noteId: note.id });
    expect(after.markdown).toBe(before);
    expect(after.attachments).toEqual([photo]);
    expect(repository.note(note.id)!.body.toString()).toContain("<notelink noteId=");
    expect(before).toContain(`決まったこと ^${blockId}`);
    expect(blockLineText(findBlock(repository.note(note.id)!.body, blockId)!)).toBe("決まったこと");
  });

  it("本文を置き換える前の状態が、作ってすぐのメモでも履歴に残る", async () => {
    const { repository, run } = await toolsOver();
    const { noteId } = await run("create_note", { title: "下書き", markdown: "利用者が書いた文" });
    await run("replace_note_body", { noteId, markdown: "AI が書き換えた文" });
    expect(bodyPlainText(repository.note(noteId)!.body)).toBe("AI が書き換えた文");
    expect((await repository.noteVersions(noteId)).map((version) => [version.reason, version.plainText])).toEqual([["replace", "利用者が書いた文"]]);
  });

  it("追記は、今ある本文を残して末尾に足す", async () => {
    const { repository, run } = await toolsOver();
    const { noteId } = await run("create_note", { title: "買い物", markdown: "牛乳" });
    await run("append_to_note", { noteId, markdown: "- 卵\n- パン" });
    expect(bodyPlainText(repository.note(noteId)!.body)).toBe("牛乳\n卵\nパン");
    expect(await repository.noteVersions(noteId)).toEqual([]);
  });

  it("タイトル・ノートブック・ピン留めを変え、ゴミ箱へ入れて戻せる", async () => {
    const { run } = await toolsOver();
    const { notebookId } = await run("create_notebook", { name: "仕事" });
    const { noteId } = await run("create_note", { title: "古い名前" });
    expect(await run("update_note", { noteId, title: "新しい名前", notebookIds: [notebookId], pinned: true }))
      .toMatchObject({ title: "新しい名前", notebookIds: [notebookId], pinned: true, bookmarked: false });
    expect((await run("move_note_to_trash", { noteId })).inTrash).toBe(true);
    expect((await run("search_notes", {})).totalCount).toBe(0);
    expect((await run("search_notes", { inTrash: true })).totalCount).toBe(1);
    expect((await run("restore_note_from_trash", { noteId })).inTrash).toBe(false);
    await run("rename_notebook", { notebookId, name: "しごと" });
    await run("delete_notebook", { notebookId });
    expect((await run("get_note", { noteId })).notebookIds).toEqual([]);
  });

  it("無い ID・形の違う引数は、理由を伝えて断る", async () => {
    const { run } = await toolsOver();
    await expect(run("get_note", { noteId: "0".repeat(32) })).rejects.toThrow("there is no note with that id");
    await expect(run("create_note", { title: 1 })).rejects.toThrow("title must be a string");
    await expect(run("create_note", { title: "a", notebookIds: ["f".repeat(32)] })).rejects.toThrow("there is no notebook");
  });

  it("完全な削除のツールは、許したときだけあり、ゴミ箱のメモだけを消す", async () => {
    await expect((await toolsOver()).run("delete_note_permanently", {})).rejects.toThrow("no tool");
    const { repository, run } = await toolsOver(true);
    const { noteId } = await run("create_note", { title: "消すメモ" });
    await expect(run("delete_note_permanently", { noteId })).rejects.toThrow("move the note to the trash first");
    await run("move_note_to_trash", { noteId });
    await run("delete_note_permanently", { noteId });
    expect(repository.note(noteId)).toBeUndefined();
  });
});

describe("MCP で本文を読んで書き戻したときに残るもの", () => {
  it("太字・斜体・取り消し線・コード・下線と、添付ファイルが残る", async () => {
    const { repository, run } = await toolsOver();
    const report = await repository.storeAttachment({ bytes: new Uint8Array([1, 2, 3, 4]), mimeType: "application/pdf", fileName: "report.pdf" });
    const note = await repository.createNote({ title: "書式のメモ" });
    appendAttachmentFile(note.body, report);
    const marked = (text: string, mark: string) => ({ type: "text", text, marks: [{ type: mark }] });
    const space = { type: "text", text: " " };
    const staged = new Y.Doc().getXmlFragment("staged");
    prosemirrorJSONToYXmlFragment(documentSchema(), { type: "doc", content: [{ type: "paragraph", content: [
      marked("太字", "bold"), space, marked("斜体", "italic"), space, marked("取り消し", "strike"), space, marked("コード", "code"), space, marked("下線", "underline"),
    ] }] }, staged);
    note.body.insert(note.body.length, staged.toArray().map((node) => node.clone() as Y.XmlElement));

    const before = (await run("get_note", { noteId: note.id })).markdown;
    await run("replace_note_body", { noteId: note.id, markdown: before });
    const body = repository.note(note.id)!.body.toString();
    for (const kept of ["<bold>太字</bold>", "<italic>斜体</italic>", "<strike>取り消し</strike>", "<code>コード</code>", "<underline>下線</underline>", "<attachmentfile"]) {
      expect(body).toContain(kept);
    }
    expect((await run("get_note", { noteId: note.id })).attachments).toEqual([report]);
    // 書き換える前の本文は履歴にある。
    expect((await repository.noteVersions(note.id)).map((version) => version.reason)).toEqual(["replace"]);
  });
});

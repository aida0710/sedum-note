import "fake-indexeddb/auto";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../../core/crypto/randomId";
import { importAesKey } from "../../core/crypto/sealedBox";
import { IndexedDbLocalStore } from "../../core/local/indexedDbLocalStore";
import { SerialQueue } from "../../core/local/serialQueue";
import { appendAttachmentImage, appendParagraph } from "../../core/notes/bodyFixtures";
import { bodyPlainText } from "../../core/notes/bodyText";
import { NoteRepository } from "../../core/notes/noteRepository";
import { exportNotesAsMarkdown } from "./markdownExport";
import { importMarkdownNotes, type ImportSourceFile } from "./markdownImport";

async function newRepository(): Promise<NoteRepository> {
  const repository = new NoteRepository({
    localStore: new IndexedDbLocalStore(`markdown-${newRandomId()}`),
    masterKey: await importAesKey(crypto.getRandomValues(new Uint8Array(32)), false),
    deviceId: newRandomId(),
    writeQueue: new SerialQueue(),
    downloadBlob: async () => null,
  });
  await repository.load();
  return repository;
}

const exportAll = (repository: NoteRepository) =>
  exportNotesAsMarkdown({ repository, notes: repository.notes(), untitledName: "無題のメモ", archiveName: "export" });

function unzipToSources(zip: Uint8Array): ImportSourceFile[] {
  return Object.entries(unzipSync(zip)).map(([path, bytes]) => ({ path, bytes }));
}

describe("Markdown の書き出しと取り込み", () => {
  it("ノートブックをフォルダに、添付を attachments に置いた zip を書き出す", async () => {
    const repository = await newRepository();
    const work = await repository.createNotebook("仕事");
    const minutes = await repository.createNotebook("議事録", work.id);
    const note = await repository.createNote({ title: "週次: 11/10", notebookIds: [minutes.id] });
    appendParagraph(note.body, "決まったこと");
    appendAttachmentImage(note.body, await repository.storeAttachment({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png", fileName: "board.png" }));
    await repository.createNote({ title: "" });
    await repository.createNote({ title: "" });

    const exported = await exportAll(repository);
    const files = unzipSync(exported.bytes);
    expect(Object.keys(files).sort()).toEqual(["attachments/board.png", "仕事/議事録/週次_ 11_10.md", "無題のメモ (2).md", "無題のメモ.md"]);
    expect(files["attachments/board.png"]).toEqual(new Uint8Array([1, 2, 3]));
    const markdown = strFromU8(files["仕事/議事録/週次_ 11_10.md"]!);
    expect(markdown).toContain('title: "週次: 11/10"');
    expect(markdown).toContain("![board.png](../../attachments/board.png)");
  });

  it("書き出した zip を別のメモ帳に取り込むと、ノートブック・タイトル・本文・添付が戻る", async () => {
    const source = await newRepository();
    const trip = await source.createNotebook("旅行");
    const note = await source.createNote({ title: "沖縄", notebookIds: [trip.id] });
    appendParagraph(note.body, "2日目はシュノーケル");
    appendAttachmentImage(note.body, await source.storeAttachment({ bytes: new Uint8Array([9, 8, 7]), mimeType: "image/png", fileName: "beach.png" }));
    await source.flush();

    const target = await newRepository();
    expect(await importMarkdownNotes(target, unzipToSources((await exportAll(source)).bytes))).toEqual({ noteCount: 1 });
    const [imported] = target.notes();
    expect(target.notebooks().map((notebook) => notebook.content.name)).toEqual(["旅行"]);
    expect([imported!.content.title, imported!.content.notebookIds, bodyPlainText(imported!.body)]).toEqual(["沖縄", [target.notebooks()[0]!.id], "2日目はシュノーケル"]);
    expect(imported!.content.attachments.map((attachment) => [attachment.fileName, attachment.mimeType])).toEqual([["beach.png", "image/png"]]);
    expect(await target.readAttachment(imported!.content.attachments[0]!.id)).toEqual(new Uint8Array([9, 8, 7]));
  });

  it("添付の無いメモ 1 件は、Markdown のファイル 1 つで書き出す", async () => {
    const repository = await newRepository();
    const note = await repository.createNote({ title: "買い物" });
    appendParagraph(note.body, "牛乳");
    const exported = await exportAll(repository);
    expect([exported.suggestedName, exported.mimeType]).toEqual(["買い物.md", "text/markdown"]);
    // 試験のメモは、作ったときの空の段落の後ろに本文が入るので、本文の前の空行の数は問わない。
    expect(strFromU8(exported.bytes)).toMatch(/^---\ntitle: "買い物"\ncreated: "[^"]+"\nupdated: "[^"]+"\n---\n\s*牛乳\n?$/);
  });

  it("タイトルの書いていない Markdown は、ファイル名をタイトルにする。Markdown が 1 つも無ければ断る", async () => {
    const repository = await newRepository();
    await importMarkdownNotes(repository, [{ path: "読書メモ.md", bytes: new TextEncoder().encode("# 第1章\n") }]);
    expect(repository.notes().map((note) => note.content.title)).toEqual(["読書メモ"]);
    await expect(importMarkdownNotes(repository, [{ path: "photo.png", bytes: new Uint8Array([1]) }])).rejects.toThrow();
  });
});

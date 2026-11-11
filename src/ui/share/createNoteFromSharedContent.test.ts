import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { bodyPlainText } from "../../core/notes/bodyText";
import { newTestRepository } from "../../core/notes/repositoryFixtures";
import type { SharedFile } from "../platform/sharedContent";
import { createNoteFromSharedContent } from "./createNoteFromSharedContent";

const newRepository = async () => (await newTestRepository()).repository;

function sharedFile(fileName: string, mimeType: string, bytes: Uint8Array | null): SharedFile {
  return { fileName, mimeType, byteLength: bytes?.length ?? null, read: () => bytes };
}

const nodeNames = (body: Y.XmlFragment) => body.toArray().map((node) => (node as Y.XmlElement).nodeName);

describe("共有から受け取った中身", () => {
  it("件名をタイトルに、文字を段落に、URL をリンクにした新しいメモになる", async () => {
    const repository = await newRepository();
    const noteId = await createNoteFromSharedContent(repository, {
      subject: "おもしろい記事", text: "あとで読む https://example.com/article?id=1 です\n\n2 行目", files: [],
    });
    const note = repository.note(noteId)!;
    expect(note.content.title).toBe("おもしろい記事");
    expect(bodyPlainText(note.body)).toBe("あとで読む https://example.com/article?id=1 です\n2 行目");
    expect(note.body.toString()).toMatch(/<link [^>]*href="https:\/\/example\.com\/article\?id=1"[^>]*>https:\/\/example\.com\/article\?id=1<\/link> です/);
  });

  it("件名が無ければ文字の 1 行目を、文字も無ければファイル名をタイトルにする", async () => {
    const repository = await newRepository();
    const fromText = await createNoteFromSharedContent(repository, { subject: "", text: "買う物\n牛乳", files: [] });
    const fromFile = await createNoteFromSharedContent(repository, { subject: "", text: "", files: [sharedFile("scan.pdf", "application/pdf", new Uint8Array([1]))] });
    expect([repository.note(fromText)!.content.title, repository.note(fromFile)!.content.title]).toEqual(["買う物", "scan.pdf"]);
  });

  it("写真は本文に表示する添付に、ほかのファイルはファイルの添付にする。添付できなかったものは本文に書く", async () => {
    const repository = await newRepository();
    const noteId = await createNoteFromSharedContent(repository, {
      subject: "",
      text: "",
      files: [
        sharedFile("photo.jpg", "image/jpeg", new Uint8Array([1, 2])),
        sharedFile("report.pdf", "application/pdf", new Uint8Array([3])),
        sharedFile("movie.mp4", "video/mp4", null),
      ],
    });
    const note = repository.note(noteId)!;
    expect(nodeNames(note.body)).toEqual(["attachmentImage", "attachmentFile", "paragraph", "paragraph"]);
    expect(note.content.attachments.map((attachment) => attachment.fileName)).toEqual(["photo.jpg", "report.pdf"]);
    expect(await repository.readAttachment(note.content.attachments[0]!.id)).toEqual(new Uint8Array([1, 2]));
    expect(bodyPlainText(note.body)).toContain("movie.mp4");
  });
});

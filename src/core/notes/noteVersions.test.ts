import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { appendAttachmentImage, appendParagraph } from "./bodyFixtures";
import { bodyPlainText } from "./bodyText";
import { RecordNotFoundError } from "./noteRepository";
import { EDIT_VERSION_INTERVAL_MILLISECONDS } from "./noteVersions";
import { newTestRepository } from "./repositoryFixtures";

const MINUTE = 60_000;

// 本文の木を、要素名・属性（値の型ごと）・文字の書式まで比べられる形にする。
type BodyStructure = { name: string; attributes: Record<string, unknown>; children: BodyStructure[] } | { delta: unknown };

function bodyStructure(body: Y.XmlFragment | Y.XmlElement): BodyStructure[] {
  return body.toArray().map((node) => {
    if (node instanceof Y.XmlText) {
      return { delta: node.toDelta() };
    }
    const element = node as Y.XmlElement;
    return { name: element.nodeName, attributes: element.getAttributes(), children: bodyStructure(element) };
  });
}

// Markdown に書けない書式を入れる: 文字色の付いた段落と、セルの結合・列の幅・背景色を持つ表。
// 属性は ProseMirror の JSON と同じ形（数値・配列のまま）で入れる（エディタが書くのと同じ）。
function appendFormattingMarkdownCannotHold(body: Y.XmlFragment): void {
  const coloredText = new Y.XmlText();
  coloredText.insert(0, "赤い字", { textColor: { color: "red" } });
  coloredText.insert(coloredText.length, "と、ふつうの字");
  const paragraph = new Y.XmlElement("paragraph");
  paragraph.insert(0, [coloredText]);

  const cellParagraph = new Y.XmlElement("paragraph");
  cellParagraph.insert(0, [new Y.XmlText("結合したセル")]);
  const cell = new Y.XmlElement("tableCell");
  cell.setAttribute("colspan", 2 as never);
  cell.setAttribute("rowspan", 1 as never);
  cell.setAttribute("colwidth", [120, 80] as never);
  cell.setAttribute("backgroundColor", "blue");
  cell.insert(0, [cellParagraph]);
  const row = new Y.XmlElement("tableRow");
  row.insert(0, [cell]);
  const table = new Y.XmlElement("table");
  table.insert(0, [row]);
  body.insert(body.length, [paragraph, table]);
}

async function repositoryWithClock() {
  const clock = { now: new Date("2026-11-11T09:00:00Z") };
  const { repository, localStore } = await newTestRepository(() => clock.now);
  const advance = (milliseconds: number) => {
    clock.now = new Date(clock.now.getTime() + milliseconds);
  };
  // 本文に 1 行足して、手元に保存する（エディタで打って保存されたのと同じ）。
  const writeLine = async (noteId: string, text: string) => {
    appendParagraph(repository.note(noteId)!.body, text);
    await repository.flush();
  };
  return { repository, localStore, advance, writeLine };
}

describe("メモの履歴", () => {
  it("編集を始める前の状態を残し、間隔が空くまでは増やさない", async () => {
    const { repository, advance, writeLine } = await repositoryWithClock();
    const note = await repository.createNote({ title: "議事録" });
    await writeLine(note.id, "1 行目");
    advance(MINUTE);
    await writeLine(note.id, "2 行目");
    // 作ってすぐの書きかけは残さない。
    expect(await repository.noteVersions(note.id)).toEqual([]);

    advance(EDIT_VERSION_INTERVAL_MILLISECONDS);
    await writeLine(note.id, "3 行目");
    advance(MINUTE);
    await writeLine(note.id, "4 行目");
    expect((await repository.noteVersions(note.id)).map((version) => version.plainText)).toEqual(["1 行目\n2 行目"]);

    advance(EDIT_VERSION_INTERVAL_MILLISECONDS);
    await writeLine(note.id, "5 行目");
    expect((await repository.noteVersions(note.id)).map((version) => [version.reason, version.title, version.plainText])).toEqual([
      ["edit", "議事録", "1 行目\n2 行目\n3 行目\n4 行目"],
      ["edit", "議事録", "1 行目\n2 行目"],
    ]);
  });

  it("タイトルやピン留めだけの変更では残さない", async () => {
    const { repository, advance, writeLine } = await repositoryWithClock();
    const note = await repository.createNote({ title: "メモ" });
    await writeLine(note.id, "本文");
    advance(EDIT_VERSION_INTERVAL_MILLISECONDS);
    await repository.updateNote(note.id, { title: "名前を変えた", pinned: true });
    await repository.flush();
    expect(await repository.noteVersions(note.id)).toEqual([]);
  });

  it("版に戻すと、そのメモの本文とタイトルが版の中身になり、ノートブックやピン留めは今のまま残る", async () => {
    const { repository, advance, writeLine } = await repositoryWithClock();
    const work = await repository.createNotebook("仕事");
    const note = await repository.createNote({ title: "議事録" });
    await writeLine(note.id, "消す前の文");
    const photo = await repository.storeAttachment({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png", fileName: "photo.png" });
    appendAttachmentImage(repository.note(note.id)!.body, photo);
    await repository.flush();
    advance(EDIT_VERSION_INTERVAL_MILLISECONDS);
    const body = repository.note(note.id)!.body;
    body.delete(0, body.length);
    await writeLine(note.id, "書き直した文");
    await repository.updateNote(note.id, { title: "議事録（改）", notebookIds: [work.id], pinned: true, bookmarked: true });
    await repository.flush();

    const [version] = await repository.noteVersions(note.id);
    advance(MINUTE);
    await repository.restoreNoteToVersion({ noteId: note.id, versionId: version!.id });

    expect(repository.notes().map((restored) => restored.id)).toEqual([note.id]);
    const restored = repository.note(note.id)!;
    expect([restored.content.title, bodyPlainText(restored.body)]).toEqual(["議事録", "消す前の文"]);
    expect(restored.content.attachments.map((attachment) => attachment.id)).toEqual([photo.id]);
    expect(await repository.readAttachment(photo.id)).toEqual(new Uint8Array([1, 2, 3]));
    expect(restored.content).toMatchObject({ notebookIds: [work.id], pinned: true, bookmarked: true });
  });

  it("版に戻す前の状態が「復元の前」として履歴に残り、そこからもう一度戻せる", async () => {
    const { repository, advance, writeLine } = await repositoryWithClock();
    const note = await repository.createNote({ title: "議事録" });
    await writeLine(note.id, "1 行目");
    advance(EDIT_VERSION_INTERVAL_MILLISECONDS);
    await writeLine(note.id, "2 行目");
    const [version] = await repository.noteVersions(note.id);

    // 前に「編集の前」を残してから間隔が空いていても、戻したあとの保存で、戻す前と同じ状態を「編集の前」として重ねない。
    advance(EDIT_VERSION_INTERVAL_MILLISECONDS);
    await repository.restoreNoteToVersion({ noteId: note.id, versionId: version!.id });
    expect((await repository.noteVersions(note.id)).map((kept) => [kept.reason, kept.plainText])).toEqual([
      ["restore", "1 行目\n2 行目"],
      ["edit", "1 行目"],
    ]);

    // 戻す前の状態へ戻し直せる（その操作の前の状態も、また残る）。
    const [beforeRestore] = await repository.noteVersions(note.id);
    advance(MINUTE);
    await repository.restoreNoteToVersion({ noteId: note.id, versionId: beforeRestore!.id });
    expect(bodyPlainText(repository.note(note.id)!.body)).toBe("1 行目\n2 行目");
    expect((await repository.noteVersions(note.id)).map((kept) => [kept.reason, kept.plainText])).toEqual([
      ["restore", "1 行目"],
      ["restore", "1 行目\n2 行目"],
      ["edit", "1 行目"],
    ]);
  });

  it("版に戻すと、アウトライン表示かどうかも、本文に合わせてその版のときに戻る", async () => {
    const { repository, advance, writeLine } = await repositoryWithClock();
    const note = await repository.createNote({ title: "箇条書き", isOutline: true });
    await writeLine(note.id, "アウトラインの項目");
    advance(EDIT_VERSION_INTERVAL_MILLISECONDS);
    await repository.updateNote(note.id, { isOutline: false });
    await writeLine(note.id, "ふつうの段落");
    const [outlineVersion] = await repository.noteVersions(note.id);
    await repository.restoreNoteToVersion({ noteId: note.id, versionId: outlineVersion!.id });
    expect(repository.note(note.id)!.content.isOutline).toBe(true);

    // 戻す前（ふつうの表示）の状態へ戻し直すと、アウトライン表示も外れる。
    const beforeRestore = (await repository.noteVersions(note.id)).find((version) => version.reason === "restore")!;
    advance(MINUTE);
    await repository.restoreNoteToVersion({ noteId: note.id, versionId: beforeRestore.id });
    expect(repository.note(note.id)!.content.isOutline).toBe(false);
  });

  it("版に戻すと、Markdown に無い書式（文字色、セルの結合・列の幅・背景色）もそのまま戻る", async () => {
    const { repository, advance, writeLine } = await repositoryWithClock();
    const note = await repository.createNote({ title: "表のメモ" });
    const body = repository.note(note.id)!.body;
    body.delete(0, body.length);
    appendFormattingMarkdownCannotHold(body);
    await repository.flush();
    const structureOfVersion = bodyStructure(body);
    advance(EDIT_VERSION_INTERVAL_MILLISECONDS);
    body.delete(0, body.length);
    await writeLine(note.id, "書式を消した文");

    const [version] = await repository.noteVersions(note.id);
    await repository.restoreNoteToVersion({ noteId: note.id, versionId: version!.id });
    expect(bodyStructure(repository.note(note.id)!.body)).toEqual(structureOfVersion);
  });

  it("無い版には戻せず、履歴も増えない", async () => {
    const { repository, writeLine } = await repositoryWithClock();
    const note = await repository.createNote({ title: "議事録" });
    await writeLine(note.id, "今の文");
    await expect(repository.restoreNoteToVersion({ noteId: note.id, versionId: "missing" })).rejects.toBeInstanceOf(RecordNotFoundError);
    expect(await repository.noteVersions(note.id)).toEqual([]);
    expect(bodyPlainText(repository.note(note.id)!.body)).toBe("今の文");
  });

  it("複製したメモが添付を使っている間は、元のメモを完全に削除しても添付は残る", async () => {
    const { repository } = await repositoryWithClock();
    const note = await repository.createNote({ title: "写真" });
    const photo = await repository.storeAttachment({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png", fileName: "photo.png" });
    appendAttachmentImage(repository.note(note.id)!.body, photo);
    await repository.flush();
    const copy = await repository.duplicateNote(note.id, "写真のコピー");
    expect(copy.content.attachments.map((attachment) => attachment.id)).toEqual([photo.id]);

    await repository.removeNotePermanently(note.id);
    expect(await repository.readAttachment(photo.id)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("メモを完全に削除すると、その履歴も消える", async () => {
    const { repository, localStore, advance, writeLine } = await repositoryWithClock();
    const note = await repository.createNote({ title: "消すメモ" });
    await writeLine(note.id, "1 行目");
    advance(EDIT_VERSION_INTERVAL_MILLISECONDS);
    await writeLine(note.id, "2 行目");
    expect(await localStore.listVersions(note.id)).toHaveLength(1);
    await repository.removeNotePermanently(note.id);
    expect(await localStore.listVersions(note.id)).toEqual([]);
  });
});

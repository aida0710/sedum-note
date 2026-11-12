import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { newRandomId } from "../crypto/randomId";
import { importAesKey } from "../crypto/sealedBox";
import { IndexedDbLocalStore } from "../local/indexedDbLocalStore";
import { SerialQueue } from "../local/serialQueue";
import { appendParagraph } from "./bodyFixtures";
import { bodyPlainText } from "./bodyText";
import { NoteRepository } from "./noteRepository";
import { MemoryRecordChangeHub } from "./recordChangeChannel";

// 同じ手元の保存を開いた 2 つのウィンドウ。保存と鍵は同じで、開いている文書はウィンドウごとに別。
async function twoWindows() {
  const databaseName = `windows-${newRandomId()}`;
  const masterKey = await importAesKey(crypto.getRandomValues(new Uint8Array(32)), false);
  const hub = new MemoryRecordChangeHub();
  // ウィンドウをまたいで 1 つずつ書く（アプリでは Web Locks が受け持つ）。
  const writeQueue = new SerialQueue();
  const openWindow = async () => {
    const repository = new NoteRepository({
      localStore: new IndexedDbLocalStore(databaseName), masterKey, deviceId: "device", writeQueue,
      downloadBlob: async () => null, downloadVersions: async () => undefined, recordChangeChannel: hub.createChannel(),
    });
    await repository.load();
    return repository;
  };
  const first = await openWindow();
  const second = await openWindow();
  // 知らせを受けた側の取り込みが終わるのを待つ（取り込みは、同じ順番待ちの後ろに並ぶ）。
  const settle = async () => {
    await first.flush();
    await second.flush();
    await writeQueue.run(async () => undefined);
  };
  return { first, second, settle, openWindow, hub };
}

const bodyLines = (repository: NoteRepository, noteId: string) => bodyPlainText(repository.note(noteId)!.body).split("\n").sort();

describe("同じ手元の保存を 2 つのウィンドウで開く", () => {
  it("片方で作ったメモと書いた本文が、もう片方に出る", async () => {
    const { first, second, settle } = await twoWindows();
    const note = await first.createNote({ title: "買い物" });
    appendParagraph(note.body, "牛乳");
    await settle();
    expect(second.note(note.id)?.content.title).toBe("買い物");
    expect(bodyLines(second, note.id)).toEqual(["牛乳"]);
  });

  it("両方で同じメモに書いても、どちらの行も、両方のウィンドウと手元の保存に残る", async () => {
    const { first, second, settle, openWindow } = await twoWindows();
    const note = await first.createNote({ title: "議事録" });
    await settle();
    // どちらも、相手の編集をまだ知らないまま書く。
    appendParagraph(first.note(note.id)!.body, "1 つ目のウィンドウの行");
    appendParagraph(second.note(note.id)!.body, "2 つ目のウィンドウの行");
    await settle();
    const expected = ["1 つ目のウィンドウの行", "2 つ目のウィンドウの行"];
    expect(bodyLines(first, note.id)).toEqual(expected);
    expect(bodyLines(second, note.id)).toEqual(expected);
    // 開き直したウィンドウ（手元の保存から読む）にも、両方の行がある。
    expect(bodyLines(await openWindow(), note.id)).toEqual(expected);
  });

  it("片方で完全に削除したメモは、もう片方からも消える", async () => {
    const { first, second, settle } = await twoWindows();
    const note = await first.createNote({ title: "消すメモ" });
    await settle();
    await second.removeNotePermanently(note.id);
    await settle();
    expect(first.note(note.id)).toBeUndefined();
    expect(first.isRemoved(note.id)).toBe(true);
  });

  it("片方の編集を、もう片方も「まだ送っていない」と数える（同期を受け持つウィンドウが送れる）", async () => {
    const { first, second, settle } = await twoWindows();
    const note = await first.createNote({ title: "メモ" });
    await settle();
    expect(second.unsyncedIds().has(note.id)).toBe(true);
    expect((await second.entriesWaitingForPush()).map((entry) => entry.id)).toEqual([note.id]);
  });

  it("同期を受け持つウィンドウが送信の記録を書き直したあとでも、相手のウィンドウの編集を取り込む", async () => {
    const { first, second, settle, hub } = await twoWindows();
    const note = await first.createNote({ title: "共有メモ" });
    appendParagraph(note.body, "1 つ目のウィンドウの行");
    await settle();
    // 1 つ目のウィンドウが、このメモを同期先へ送り始める。
    const [sent] = await first.entriesWaitingForPush();
    // 送っている間に、2 つ目のウィンドウが書く。その知らせは、まだ 1 つ目のウィンドウに届いていない。
    hub.holdDeliveries();
    appendParagraph(second.note(note.id)!.body, "2 つ目のウィンドウの行");
    await second.flush();
    // 送り終えて、送信の記録を書き直す（手元の保存には、もう 2 つ目のウィンドウの中身が入っている）。
    await first.confirmPushed(sent!, "etag-1");
    hub.deliverHeld();
    await settle();
    expect(bodyLines(first, note.id)).toEqual(["1 つ目のウィンドウの行", "2 つ目のウィンドウの行"]);
    // 2 つ目のウィンドウの編集は、まだ送っていないものとして残る。
    expect(first.unsyncedIds().has(note.id)).toBe(true);
  });
});

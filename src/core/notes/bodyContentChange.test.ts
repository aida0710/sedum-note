import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { BLOCK_ID_ATTRIBUTE, ensureBlockId } from "./bodyBlocks";
import { FOLDED_ATTRIBUTE } from "./bodyContentChange";
import { appendParagraph } from "./bodyFixtures";
import { EDIT_VERSION_INTERVAL_MILLISECONDS } from "./noteVersions";
import { newTestRepository } from "./repositoryFixtures";

const MINUTE = 60_000;
// エディタ（y-tiptap）が本文を書き換えるときの origin の代わり。項目の書き込みやデータの形の移し替えとは別のもの。
const EDITOR_ORIGIN = { editor: true };

function appendHeading(body: Y.XmlFragment, text: string): Y.XmlElement {
  const heading = new Y.XmlElement("heading");
  heading.setAttribute("level", 2 as never);
  heading.insert(0, [new Y.XmlText(text)]);
  body.insert(body.length, [heading]);
  return heading;
}

// 本文を書いて保存し、履歴が残るだけの時間を空けたメモを用意する。
async function writtenNote() {
  const clock = { now: new Date("2026-11-13T09:00:00Z") };
  const { repository, localStore } = await newTestRepository(() => clock.now);
  const note = await repository.createNote({ title: "議事録" });
  const heading = appendHeading(note.body, "決まったこと");
  appendParagraph(note.body, "来週までに見積もりを出す");
  await repository.flush();
  clock.now = new Date(clock.now.getTime() + EDIT_VERSION_INTERVAL_MILLISECONDS + MINUTE);
  const updatedAt = repository.note(note.id)!.updatedAt;
  const changeBody = async (change: () => void) => {
    note.body.doc!.transact(change, EDITOR_ORIGIN);
    await repository.flush();
  };
  return { repository, localStore, note, heading, updatedAt, changeBody };
}

describe("中身を変えない本文の変更", () => {
  it("見出しを折りたたむ・開くだけでは、メモの更新日時は変わらず、履歴も増えない。開け閉めは保存して同期に回す", async () => {
    const { repository, localStore, note, heading, updatedAt, changeBody } = await writtenNote();
    const sealedBefore = (await localStore.getRecordEntry(note.id))!.sealed;

    await changeBody(() => heading.setAttribute(FOLDED_ATTRIBUTE, true as never));
    await changeBody(() => heading.setAttribute(FOLDED_ATTRIBUTE, false as never));

    expect(repository.note(note.id)!.updatedAt).toBe(updatedAt);
    expect(await repository.noteVersions(note.id)).toEqual([]);
    const stored = (await localStore.getRecordEntry(note.id))!;
    expect(stored.sealed).not.toEqual(sealedBefore);
    expect(stored.waitingForPush).toBe(true);
  });

  it("リンクの先に選ばれたブロックへ ID を付けても、そのメモの更新日時は変わらない", async () => {
    const { repository, note, heading, updatedAt } = await writtenNote();

    ensureBlockId(heading);
    await repository.flush();

    expect(heading.getAttribute(BLOCK_ID_ATTRIBUTE)).not.toBeUndefined();
    expect(repository.note(note.id)!.updatedAt).toBe(updatedAt);
    expect(await repository.noteVersions(note.id)).toEqual([]);
  });

  it("文字を書き換えたら、編集として更新日時が変わり、編集の前の状態が履歴に残る", async () => {
    const { repository, note, updatedAt, changeBody } = await writtenNote();

    await changeBody(() => appendParagraph(note.body, "担当は田中"));

    expect(repository.note(note.id)!.updatedAt > updatedAt).toBe(true);
    expect(await repository.noteVersions(note.id)).toHaveLength(1);
  });

  it("折りたたみと同時に文字も変えたら、編集として扱う", async () => {
    const { repository, note, heading, updatedAt, changeBody } = await writtenNote();

    await changeBody(() => {
      heading.setAttribute(FOLDED_ATTRIBUTE, true as never);
      appendParagraph(note.body, "担当は田中");
    });

    expect(repository.note(note.id)!.updatedAt > updatedAt).toBe(true);
  });

  it("段落を消しただけでも、編集として扱う", async () => {
    const { repository, note, updatedAt, changeBody } = await writtenNote();

    await changeBody(() => note.body.delete(1, 1));

    expect(repository.note(note.id)!.updatedAt > updatedAt).toBe(true);
    expect(await repository.noteVersions(note.id)).toHaveLength(1);
  });

  it("文字の書式だけを変えても、編集として扱う", async () => {
    const { repository, note, heading, updatedAt, changeBody } = await writtenNote();

    await changeBody(() => (heading.get(0) as Y.XmlText).format(0, 2, { bold: {} }));

    expect(repository.note(note.id)!.updatedAt > updatedAt).toBe(true);
  });

  it("見出しの段のような、中身に関わる属性を変えたら、編集として扱う", async () => {
    const { repository, note, heading, updatedAt, changeBody } = await writtenNote();

    await changeBody(() => heading.setAttribute("level", 3 as never));

    expect(repository.note(note.id)!.updatedAt > updatedAt).toBe(true);
  });
});

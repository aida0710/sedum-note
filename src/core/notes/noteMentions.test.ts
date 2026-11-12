import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { appendParagraph } from "./bodyFixtures";
import { bodyLinkedNoteIds } from "./bodyText";
import { findUnlinkedMentions, linkFirstMention } from "./noteMentions";
import { noteContentFixture } from "./noteFixtures";
import { summarizeNote } from "./noteQueries";
import type { LiveNote } from "./noteRecords";

function bodyWith(...paragraphs: string[]): Y.XmlFragment {
  const body = new Y.Doc().getXmlFragment("body");
  paragraphs.forEach((text) => appendParagraph(body, text));
  return body;
}

function note(id: string, title: string, body = bodyWith(), updatedAt = "2026-11-01T00:00:00Z"): LiveNote {
  return { id, kind: "note", updatedAt, revision: 0, body, content: noteContentFixture({ createdAt: updatedAt, title }) };
}

function paragraphChildren(body: Y.XmlFragment): string[] {
  const paragraph = body.get(0) as Y.XmlElement;
  return paragraph.toArray().map((child) => (child instanceof Y.XmlText ? `text:${child.toString()}` : `${(child as Y.XmlElement).nodeName}:${(child as Y.XmlElement).getAttribute("noteId")}`));
}

describe("リンクしていない言及", () => {
  it("題を文字のまま書いたメモを、新しいものから並べる。リンク済みのメモ、ゴミ箱のメモ、自分自身は除く", () => {
    const target = note("t", "旅行の持ち物", bodyWith("旅行の持ち物"));
    const linked = note("l", "リンク済み", bodyWith("旅行の持ち物"));
    linkFirstMention(linked.body, { title: "旅行の持ち物", noteId: "t" });
    const older = note("o", "古い", bodyWith("先に旅行の持ち物を見直す"), "2026-11-01T00:00:00Z");
    const newer = note("n", "新しい", bodyWith("旅行の持ち物、まだ"), "2026-11-05T00:00:00Z");
    const trashed = { ...note("x", "捨てた", bodyWith("旅行の持ち物")), content: noteContentFixture({ createdAt: "2026-11-01T00:00:00Z", trashedAt: "2026-11-02T00:00:00Z" }) };
    const mentions = findUnlinkedMentions([target, linked, older, newer, trashed].map(summarizeNote), target);
    expect(mentions.map(({ note }) => note.id)).toEqual(["n", "o"]);
    expect(mentions[1]!.excerpt).toBe("先に旅行の持ち物を見直す");
  });

  it("英数字の題は、ほかの英単語の一部には当てない。1 文字の題は探さない", () => {
    const summaries = [note("a", "", bodyWith("Google の Go")), note("b", "", bodyWith("Gopher"))].map(summarizeNote);
    expect(findUnlinkedMentions(summaries, note("t", "go")).map(({ note }) => note.id)).toEqual(["a"]);
    expect(findUnlinkedMentions(summaries, note("t", "G"))).toEqual([]);
  });

  it("最初の言及をリンクに置き換え、前後の文字を残す", () => {
    const body = bodyWith("明日は旅行の準備。旅行は楽しみ");
    expect(linkFirstMention(body, { title: "旅行", noteId: "t" })).toBe(true);
    expect(paragraphChildren(body)).toEqual(["text:明日は", "noteLink:t", "text:の準備。旅行は楽しみ"]);
    expect(bodyLinkedNoteIds(body)).toEqual(["t"]);
  });

  it("後ろの文字の太字は保つ。コードの中の言及は置き換えない", () => {
    const body = new Y.Doc().getXmlFragment("body");
    const paragraph = new Y.XmlElement("paragraph");
    body.insert(0, [paragraph]);
    const text = new Y.XmlText();
    paragraph.insert(0, [text]);
    text.insert(0, "旅行", { code: true });
    text.insert(2, " と旅行", {});
    text.insert(6, "の本", { bold: true });
    expect(linkFirstMention(body, { title: "旅行", noteId: "t" })).toBe(true);
    expect(text.toDelta()).toEqual([{ insert: "旅行", attributes: { code: true } }, { insert: " と" }]);
    expect((paragraph.get(1) as Y.XmlElement).nodeName).toBe("noteLink");
    expect((paragraph.get(2) as Y.XmlText).toDelta()).toEqual([{ insert: "の本", attributes: { bold: true } }]);
  });

  it("段落の頭や、段落の全部が言及なら、空の文字を残さずにリンクにする", () => {
    const whole = bodyWith("旅行");
    expect(linkFirstMention(whole, { title: "旅行", noteId: "t" })).toBe(true);
    expect(paragraphChildren(whole)).toEqual(["noteLink:t"]);
    const head = bodyWith("旅行の準備");
    expect(linkFirstMention(head, { title: "旅行", noteId: "t" })).toBe(true);
    expect(paragraphChildren(head)).toEqual(["noteLink:t", "text:の準備"]);
  });

  it("言及が見つからなければ、何も変えずに false を返す", () => {
    const body = bodyWith("関係のない話");
    expect(linkFirstMention(body, { title: "旅行", noteId: "t" })).toBe(false);
    expect(paragraphChildren(body)).toEqual(["text:関係のない話"]);
  });
});

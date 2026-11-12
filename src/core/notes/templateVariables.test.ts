import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { bodyPlainText, type TextOperation } from "./bodyText";
import { newTestRepository } from "./repositoryFixtures";
import {
  type ProseMirrorNodeJson,
  replaceTemplateVariablesInBody,
  replaceTemplateVariablesInNodes,
  replaceTemplateVariablesInRuns,
  replaceTemplateVariablesInText,
  type TemplateTimeValues,
} from "./templateVariables";

const TIMES: TemplateTimeValues = { date: "2026-11-13", time: "09:05", datetime: "2026-11-13 09:05" };
const VALUES = { ...TIMES, title: "11月の定例" };

// 書式つきの文字の段落を、本文の末尾に足す。
function appendFormattedParagraph(body: Y.XmlFragment, delta: TextOperation[]): Y.XmlText {
  const text = new Y.XmlText();
  const paragraph = new Y.XmlElement("paragraph");
  paragraph.insert(0, [text]);
  body.insert(body.length, [paragraph]);
  text.applyDelta(delta);
  return text;
}

function lastParagraphText(body: Y.XmlFragment): Y.XmlText {
  return (body.get(body.length - 1) as Y.XmlElement).get(0) as Y.XmlText;
}

describe("テンプレートの変数を、文字の中で置き換える", () => {
  it("@date・@time・@datetime・@title を値に置き換える。@datetime を @date と time に分けない", () => {
    expect(replaceTemplateVariablesInText("@date @time / @datetime / @title", VALUES)).toBe("2026-11-13 09:05 / 2026-11-13 09:05 / 11月の定例");
  });

  it("日本語の文字は前後に続いてよい", () => {
    expect(replaceTemplateVariablesInText("作成日は@dateです", VALUES)).toBe("作成日は2026-11-13です");
  });

  it("英数字に続く @（メールアドレス）と、後ろに英数字が続く語（@dates）は置き換えない", () => {
    expect(replaceTemplateVariablesInText("foo@date.example と @dates と @title_x", VALUES)).toBe("foo@date.example と @dates と @title_x");
  });

  it("値を渡さなかった変数は、文字のまま残す", () => {
    expect(replaceTemplateVariablesInText("@date の @title", TIMES)).toBe("2026-11-13 の @title");
  });

  it("書式の境目をまたぐ変数と、行の中のコードの変数は置き換えない。前後の文字は書式をまたいで見る", () => {
    expect(replaceTemplateVariablesInRuns([{ text: "@da", isCode: false }, { text: "te", isCode: false }], VALUES)).toEqual(["@da", "te"]);
    expect(replaceTemplateVariablesInRuns([{ text: "@date", isCode: true }], VALUES)).toEqual(["@date"]);
    // 太字の「foo」に続く「@date」は、メールアドレスの一部。
    expect(replaceTemplateVariablesInRuns([{ text: "foo", isCode: false }, { text: "@date", isCode: false }], VALUES)).toEqual(["foo", "@date"]);
    expect(replaceTemplateVariablesInRuns([{ text: "締め切り ", isCode: false }, { text: "@date", isCode: false }, { text: "s", isCode: false }], VALUES))
      .toEqual(["締め切り ", "@date", "s"]);
  });
});

describe("テンプレートの変数を、ProseMirror の JSON の中で置き換える", () => {
  it("書式（太字）と属性を保ち、コードのブロックと行の中のコードは置き換えない。渡した JSON は変えない", () => {
    const nodes: ProseMirrorNodeJson[] = [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "@title" }] },
      { type: "paragraph", content: [
        { type: "text", text: "日付: " },
        { type: "text", text: "@date", marks: [{ type: "bold" }] },
        { type: "text", text: " @time", marks: [{ type: "code" }] },
      ] },
      { type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "echo @date" }] },
    ];
    const original = structuredClone(nodes);
    expect(replaceTemplateVariablesInNodes(nodes, VALUES)).toEqual([
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "11月の定例" }] },
      { type: "paragraph", content: [
        { type: "text", text: "日付: " },
        { type: "text", text: "2026-11-13", marks: [{ type: "bold" }] },
        { type: "text", text: " @time", marks: [{ type: "code" }] },
      ] },
      { type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "echo @date" }] },
    ]);
    expect(nodes).toEqual(original);
  });

  it("文字でないノード（メモへのリンク）は区切りになる。空になった文字のノードは除く", () => {
    const nodes: ProseMirrorNodeJson[] = [{ type: "paragraph", content: [
      { type: "noteLink", attrs: { noteId: "n1" } },
      { type: "text", text: "@title" },
    ] }];
    expect(replaceTemplateVariablesInNodes(nodes, { ...TIMES, title: "" })).toEqual([{ type: "paragraph", content: [
      { type: "noteLink", attrs: { noteId: "n1" } },
    ] }]);
  });
});

describe("テンプレートの変数を、本文（Yjs）の中で置き換える", () => {
  it("太字の変数は太字のまま、前後の書式の無い文字は書式の無いまま置き換える", () => {
    const body = new Y.Doc().getXmlFragment("body");
    const text = appendFormattedParagraph(body, [{ insert: "日付: " }, { insert: "@date", attributes: { bold: {} } }, { insert: " と @time" }, { insert: "@title", attributes: { code: {} } }]);
    replaceTemplateVariablesInBody(body, VALUES);
    expect(text.toDelta()).toEqual([
      { insert: "日付: " },
      { insert: "2026-11-13", attributes: { bold: {} } },
      { insert: " と 09:05" },
      { insert: "@title", attributes: { code: {} } },
    ]);
  });

  it("コードのブロックの中は置き換えない", () => {
    const body = new Y.Doc().getXmlFragment("body");
    const codeBlock = new Y.XmlElement("codeBlock");
    codeBlock.insert(0, [new Y.XmlText("echo @date")]);
    body.insert(0, [codeBlock]);
    replaceTemplateVariablesInBody(body, VALUES);
    expect(bodyPlainText(body)).toBe("echo @date");
  });
});

describe("テンプレートから新しいメモを作る", () => {
  it("題と本文の変数を置き換える。本文の @title はできあがるメモの題になる。テンプレートは変えない", async () => {
    const { repository } = await newTestRepository();
    const template = await repository.createNote({ title: "@date の日報", isTemplate: true });
    appendFormattedParagraph(repository.note(template.id)!.body, [{ insert: "# " }, { insert: "@title", attributes: { bold: {} } }, { insert: " @time に作成" }]);

    const created = await repository.createNoteFromTemplate({ templateId: template.id, timeValues: TIMES, changes: { isTemplate: false } });
    expect(created.content.title).toBe("2026-11-13 の日報");
    expect(created.content.isTemplate).toBe(false);
    expect(lastParagraphText(created.body).toDelta()).toEqual([
      { insert: "# " },
      { insert: "2026-11-13 の日報", attributes: { bold: {} } },
      { insert: " 09:05 に作成" },
    ]);
    expect(repository.note(template.id)!.content.title).toBe("@date の日報");
    expect(bodyPlainText(repository.note(template.id)!.body)).toBe("# @title @time に作成");
  });

  it("題を渡したときは、その題を使い、本文の @title もその題になる", async () => {
    const { repository } = await newTestRepository();
    const template = await repository.createNote({ title: "@date の日報", isTemplate: true });
    appendFormattedParagraph(repository.note(template.id)!.body, [{ insert: "@title" }]);
    const created = await repository.createNoteFromTemplate({ templateId: template.id, timeValues: TIMES, changes: { title: "別の題", isTemplate: false } });
    expect(created.content.title).toBe("別の題");
    expect(bodyPlainText(created.body)).toBe("別の題");
  });
});

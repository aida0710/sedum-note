import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { countCharacters, countDocumentCharacters } from "./characterCount";

describe("本文の文字数", () => {
  it("改行と空白を数えない", () => {
    expect(countCharacters("あい う\n　えお\t")).toBe(5);
  });

  it("絵文字や結合した文字は、見た目の 1 文字を 1 と数える", () => {
    expect(countCharacters("👨‍👩‍👧が🇯🇵")).toBe(3);
  });
});

describe("本文全体の文字数", () => {
  const schema = new Schema({ nodes: { doc: { content: "paragraph+" }, paragraph: { content: "text*" }, text: {} } });
  const doc = (paragraphs: string[]) => schema.node("doc", null, paragraphs.map((text) => schema.node("paragraph", null, text ? [schema.text(text)] : [])));

  it("段落ごとに数えて足した数は、本文全体を 1 度に数えた数と同じ", () => {
    const body = doc(["あい う", "", "👨‍👩‍👧が🇯🇵", "abc def"]);
    expect(countDocumentCharacters(body)).toBe(countCharacters(body.textBetween(0, body.content.size, "\n")));
  });

  it("1 つの段落を書き換えたあとも、書き換えたあとの本文の文字数になる", () => {
    const before = doc(["あいう", "えお"]);
    expect(countDocumentCharacters(before)).toBe(5);
    const after = before.replace(before.content.size - 3, before.content.size - 1, doc(["かきくけこ"]).slice(1, 6));
    expect(after.textBetween(0, after.content.size, "|")).toBe("あいう|かきくけこ");
    expect(countDocumentCharacters(after)).toBe(8);
  });
});

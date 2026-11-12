import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { documentSchema } from "./documentSchema";
import { isOutlineBody, outlineFromBody } from "./outlineMode";

const text = (value: string): JSONContent => ({ type: "text", text: value });
const paragraph = (value = ""): JSONContent => (value === "" ? { type: "paragraph" } : { type: "paragraph", content: [text(value)] });
const heading = (level: number, value: string): JSONContent => ({ type: "heading", attrs: { level }, content: [text(value)] });
const bulletList = (...items: JSONContent[]): JSONContent => ({ type: "bulletList", content: items });
const item = (...content: JSONContent[]): JSONContent => ({ type: "listItem", content });

// 項目を「文字」と「子の項目」の入れ子の配列にして、形を読みやすく比べる。
type OutlineShape = [string, OutlineShape[]];
function shapeOf(list: JSONContent): OutlineShape[] {
  return (list.content ?? []).map((listItem): OutlineShape => {
    const blocks = listItem.content ?? [];
    const line = blocks.filter((block) => block.type !== "bulletList").map((block) => (block.type === "paragraph" ? block.content?.map((inline) => inline.text).join("") ?? "" : `<${block.type}>`)).join(" ");
    return [line, blocks.filter((block) => block.type === "bulletList").flatMap(shapeOf)];
  });
}

function outlineShapeOf(blocks: JSONContent[]): OutlineShape[] {
  const outline = outlineFromBody(documentSchema().nodeFromJSON({ type: "doc", content: blocks }));
  expect(isOutlineBody(outline)).toBe(true);
  return shapeOf(outline.toJSON().content[0]);
}

describe("本文をアウトラインにする", () => {
  it("段落は項目になり、空の段落は捨てる。今ある箇条書きの項目は、子ごとそのまま項目になる", () => {
    expect(outlineShapeOf([paragraph("はじめに"), paragraph(), bulletList(item(paragraph("親"), bulletList(item(paragraph("子")))))]))
      .toEqual([["はじめに", []], ["親", [["子", []]]]]);
  });

  it("見出しは親の項目になり、次の同じ段か上の段の見出しまでが、その子になる", () => {
    expect(outlineShapeOf([heading(1, "旅行"), paragraph("概要"), heading(2, "宿"), paragraph("駅前"), heading(2, "持ち物"), heading(1, "仕事"), paragraph("報告")]))
      .toEqual([["旅行", [["概要", []], ["宿", [["駅前", []]]], ["持ち物", []]]], ["仕事", [["報告", []]]]]);
  });

  it("段落でないブロック（コードなど）は、空の段落で始まる項目の中に入る", () => {
    expect(outlineShapeOf([{ type: "codeBlock", content: [text("a = 1")] }])).toEqual([[" <codeBlock>", []]]);
  });

  it("中身の無い本文は、空の項目 1 つになる", () => {
    expect(outlineShapeOf([paragraph()])).toEqual([["", []]]);
  });
});

import { describe, expect, it } from "vitest";
import { DATA_FORMAT_VERSION } from "../../core/format/dataFormat";
import { documentSchema } from "./documentSchema";

// エディタにノードや書式（マーク）を足すと、足す前のアプリはそれを本文から消してしまう。
// この試験が落ちたら、一覧を直すだけでなく DATA_FORMAT_VERSION（core/format/dataFormat.ts）を 1 つ上げる。
// 上げると、古い版のアプリは更新するまで同期を止める。
describe("本文の形", () => {
  it("ノードと書式の名前が、データの形の版 14 のときのまま変わっていない", () => {
    expect(DATA_FORMAT_VERSION).toBe(14);
    const schema = documentSchema();
    expect(Object.keys(schema.nodes).sort()).toEqual([
      "attachmentFile", "attachmentImage", "blockEmbed", "blockMath", "blockquote", "bulletList", "callout", "codeBlock", "column", "columns", "doc", "drawing", "drawingStroke", "embed", "footnoteReference", "hardBreak", "heading", "horizontalRule", "inlineMath",
      "listItem", "noteLink", "noteQuery", "orderedList", "paragraph", "table", "tableCell", "tableHeader", "tableRow", "taskItem", "taskList", "text",
    ]);
    expect(Object.keys(schema.marks).sort()).toEqual(["bold", "code", "highlight", "italic", "link", "strike", "textColor", "underline"]);
  });
});

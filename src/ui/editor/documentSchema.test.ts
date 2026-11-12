import { describe, expect, it } from "vitest";
import { BODY_SCHEMA_VERSION } from "../../core/notes/bodySchema";
import { documentSchema } from "./documentSchema";

// エディタにノードや書式（マーク）を足すと、足す前のアプリはそれを本文から消してしまう。
// この試験が落ちたら、一覧を直すだけでなく BODY_SCHEMA_VERSION（core/notes/bodySchema.ts）を 1 つ上げる。
// 上げると、古い版のアプリは更新するまで同期を止める。
describe("本文の形", () => {
  it("ノードと書式の名前が、本文の形の版 2 のときのまま変わっていない", () => {
    expect(BODY_SCHEMA_VERSION).toBe(2);
    const schema = documentSchema();
    expect(Object.keys(schema.nodes).sort()).toEqual([
      "attachmentFile", "attachmentImage", "blockquote", "bulletList", "codeBlock", "doc", "hardBreak", "heading", "horizontalRule",
      "listItem", "noteLink", "orderedList", "paragraph", "table", "tableCell", "tableHeader", "tableRow", "taskItem", "taskList", "text",
    ]);
    expect(Object.keys(schema.marks).sort()).toEqual(["bold", "code", "italic", "link", "strike", "underline"]);
  });
});

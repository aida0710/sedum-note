import type { JSONContent } from "@tiptap/core";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { documentSchema } from "../editor/documentSchema";
import type { BodyExportContext, MarkdownImportContext } from "../markdown/markdownDocument";
import { applyBodyChange, createBodyChangeProposal, StaleBodyChangeError } from "./noteBodyChange";

// 先のメモが無いもの（リンク・埋め込みは書き出されない）と、添付の無い本文を扱う、最小の書き出しと読み込み。
const exportContext: BodyExportContext = { attachmentHref: () => "", noteTitle: () => null };
const importContext: MarkdownImportContext = { attachFile: async () => null, noteExists: () => false };
const MISSING_NOTE_ID = "0".repeat(32);

function bodyOf(blocks: JSONContent[]): Y.XmlFragment {
  const body = new Y.Doc().getXmlFragment("body");
  prosemirrorJSONToYXmlFragment(documentSchema(), { type: "doc", content: blocks }, body);
  return body;
}

const paragraph = (text: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] });
const blocksOf = (body: Y.XmlFragment) => (yXmlFragmentToProsemirrorJSON(body) as JSONContent).content ?? [];

describe("本文の差分の差し替え", () => {
  it("書き出せないブロック（先のメモが無い埋め込み）を挟んでも、直した段落だけを入れ替え、埋め込みは残す", async () => {
    const body = bodyOf([paragraph("前の段落"), { type: "blockEmbed", attrs: { noteId: MISSING_NOTE_ID, blockId: "abcdef" } }, paragraph("後ろの段落")]);
    const proposal = await createBodyChangeProposal({ body, markdown: "前の段落\n\n直した後ろの段落\n", exportContext, importContext });
    applyBodyChange(body, proposal, exportContext);
    expect(blocksOf(body).map((block) => block.type)).toEqual(["paragraph", "blockEmbed", "paragraph"]);
    expect(blocksOf(body)[2]).toMatchObject(paragraph("直した後ろの段落"));
  });

  it("直していないブロックは、Markdown に無い書式（文字色）ごと残る", async () => {
    const colored = paragraph("赤い文字", [{ type: "textColor", attrs: { color: "red" } }]);
    const body = bodyOf([colored, paragraph("ふつうの文字")]);
    const proposal = await createBodyChangeProposal({ body, markdown: "赤い文字\n\nふつうの文字を直した\n", exportContext, importContext });
    expect(proposal.hunks).toEqual([{ oldStart: 1, oldEnd: 2, newStart: 1, newEnd: 2 }]);
    applyBodyChange(body, proposal, exportContext);
    expect(blocksOf(body)[0]).toMatchObject(colored);
    expect(blocksOf(body)[1]).toMatchObject(paragraph("ふつうの文字を直した"));
  });

  it("直していないブロックの ID は残り、直したブロックも行の末尾の「 ^ID」の印で同じ ID を持ち続ける", async () => {
    const withId = (text: string, blockId: string): JSONContent => ({ ...paragraph(text), attrs: { blockId } });
    const body = bodyOf([withId("一", "1a-2b"), withId("二", "1a-3c")]);
    applyBodyChange(body, await createBodyChangeProposal({ body, markdown: "一 ^1a-2b\n\n二を直した ^1a-3c\n", exportContext, importContext }), exportContext);
    expect(blocksOf(body).map((block) => [block.content?.[0]?.text, block.attrs?.blockId])).toEqual([["一", "1a-2b"], ["二を直した", "1a-3c"]]);
  });

  it("ブロックを足し、消せる。全部を消しても、本文は空の段落 1 つになる", async () => {
    const body = bodyOf([paragraph("一"), paragraph("二")]);
    applyBodyChange(body, await createBodyChangeProposal({ body, markdown: "一\n\n一と二の間\n\n二\n\n三\n", exportContext, importContext }), exportContext);
    expect(blocksOf(body).map((block) => block.content?.[0]?.text)).toEqual(["一", "一と二の間", "二", "三"]);
    applyBodyChange(body, await createBodyChangeProposal({ body, markdown: "", exportContext, importContext }), exportContext);
    expect(blocksOf(body)).toEqual([{ type: "paragraph" }]);
  });

  it("案を作ったあとで本文が変わっていたら、何も書かずに StaleBodyChangeError", async () => {
    const body = bodyOf([paragraph("元の文")]);
    const proposal = await createBodyChangeProposal({ body, markdown: "AI の文\n", exportContext, importContext });
    // 既にある本文へ渡すと、本文をこの中身に合わせて書き換える（エディタで書き換えたのと同じ）。
    prosemirrorJSONToYXmlFragment(documentSchema(), { type: "doc", content: [paragraph("利用者が書き換えた文")] }, body);
    expect(() => applyBodyChange(body, proposal, exportContext)).toThrow(StaleBodyChangeError);
    expect(blocksOf(body)).toEqual([paragraph("利用者が書き換えた文")]);
  });
});

import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { BLOCK_ID_ATTRIBUTE, blockLineText, ensureBlockId, findBlock, isBlockId, linkableBlocks } from "./bodyBlocks";
import { appendParagraph } from "./bodyFixtures";

function bodyOfNewDocument(): Y.XmlFragment {
  return new Y.Doc().getXmlFragment("body");
}

function textBlock(nodeName: string, text: string): Y.XmlElement {
  const block = new Y.XmlElement(nodeName);
  block.insert(0, [new Y.XmlText(text)]);
  return block;
}

function listItem(text: string, children: Y.XmlElement[] = []): Y.XmlElement {
  const item = new Y.XmlElement("listItem");
  const nested = new Y.XmlElement("bulletList");
  nested.insert(0, children);
  item.insert(0, children.length > 0 ? [textBlock("paragraph", text), nested] : [textBlock("paragraph", text)]);
  return item;
}

function syncBothWays(left: Y.Doc, right: Y.Doc): void {
  Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
  Y.applyUpdate(left, Y.encodeStateAsUpdate(right));
}

describe("リンクの先にできるブロック", () => {
  it("段落、見出し、箇条書きの項目を、本文の順に並べる。項目は、子を含めないその行の文字で並ぶ", () => {
    const body = bodyOfNewDocument();
    const list = new Y.XmlElement("bulletList");
    list.insert(0, [listItem("親", [listItem("子")])]);
    const quote = new Y.XmlElement("blockquote");
    quote.insert(0, [textBlock("paragraph", "引用の中")]);
    body.insert(0, [textBlock("heading", "見出し"), textBlock("paragraph", ""), list, quote]);
    const blocks = linkableBlocks(body);
    expect(blocks.map((block) => [block.element.nodeName, block.text])).toEqual([["heading", "見出し"], ["listItem", "親"], ["listItem", "子"], ["paragraph", "引用の中"]]);
    expect(blockLineText(blocks[1]!.element)).toBe("親");
  });

  it("ID を付けたブロックを、ID で探せる。もう一度付けても同じ ID のまま", () => {
    const body = bodyOfNewDocument();
    appendParagraph(body, "1 行目");
    appendParagraph(body, "2 行目");
    const second = linkableBlocks(body)[1]!.element;
    const blockId = ensureBlockId(second);
    expect(isBlockId(blockId)).toBe(true);
    expect(ensureBlockId(second)).toBe(blockId);
    expect(findBlock(body, blockId)).toBe(second);
    expect(findBlock(body, "0-0")).toBeNull();
  });

  it("2 台が同時に同じブロックへ ID を付けても同じ値になり、マージしたあともどちらのリンクも届く", () => {
    const left = new Y.Doc();
    const right = new Y.Doc();
    appendParagraph(left.getXmlFragment("body"), "共有の行");
    syncBothWays(left, right);
    const leftId = ensureBlockId(linkableBlocks(left.getXmlFragment("body"))[0]!.element);
    const rightId = ensureBlockId(linkableBlocks(right.getXmlFragment("body"))[0]!.element);
    expect(rightId).toBe(leftId);
    syncBothWays(left, right);
    for (const document of [left, right]) {
      expect(findBlock(document.getXmlFragment("body"), leftId)?.getAttribute(BLOCK_ID_ATTRIBUTE)).toBe(leftId);
    }
  });

  it("同じ ID のブロックが 2 つあるときは、本文で先に出てくる方を返す", () => {
    const body = bodyOfNewDocument();
    appendParagraph(body, "先");
    appendParagraph(body, "後");
    const [first, second] = linkableBlocks(body).map((block) => block.element);
    const blockId = ensureBlockId(first!);
    second!.setAttribute(BLOCK_ID_ATTRIBUTE, blockId);
    expect(findBlock(body, blockId)).toBe(first);
  });
});

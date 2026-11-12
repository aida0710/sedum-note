// 本文の中の、リンクの先にできるブロック（段落、見出し、箇条書きの項目）と、その ID。
//
// ID は、リンクの先に選ばれたブロックにだけ、本文の属性（blockId）として付ける。属性なので、ブロックを
// 動かしても書き換えても付いていく。値は、付けるときのそのブロックの Yjs での ID から決める。2 台が同時に
// 同じブロックへ付けても同じ値になるので、マージで片方のリンクが切れない。

import * as Y from "yjs";
import { nodePlainText } from "./bodyText";

export const BLOCK_ID_ATTRIBUTE = "blockId";

const TEXT_BLOCK_NODE_NAMES = ["paragraph", "heading"];
const LIST_ITEM_NODE_NAMES = ["listItem", "taskItem"];
// ID を持てるブロックの種類（Tiptap のノード名）。
export const LINKABLE_BLOCK_NODE_NAMES = [...TEXT_BLOCK_NODE_NAMES, ...LIST_ITEM_NODE_NAMES];

// Yjs の ID（デバイスの番号と、そのデバイスでの通し番号）を 36 進で並べた形。
const BLOCK_ID_PATTERN = /^[0-9a-z]+-[0-9a-z]+$/;

export function isBlockId(value: unknown): value is string {
  return typeof value === "string" && BLOCK_ID_PATTERN.test(value);
}

export type LinkableBlock = {
  element: Y.XmlElement;
  // そのブロックの文字。箇条書きの項目は、子の項目を含めない、その項目の行だけ。
  text: string;
};

function isElementNamed(node: unknown, nodeNames: string[]): node is Y.XmlElement {
  return node instanceof Y.XmlElement && nodeNames.includes(node.nodeName);
}

// リンクの先に選べるブロックを、本文に出てくる順に並べる。文字の無いブロックは除く。
export function linkableBlocks(body: Y.XmlFragment): LinkableBlock[] {
  const blocks: LinkableBlock[] = [];
  const addBlock = (element: Y.XmlElement, textSource: Y.XmlElement | undefined) => {
    const text = textSource ? nodePlainText(textSource) : "";
    if (text !== "") {
      blocks.push({ element, text });
    }
  };
  const visit = (node: Y.XmlFragment | Y.XmlElement) => {
    const children = node.toArray();
    children.forEach((child, index) => {
      if (isElementNamed(child, LIST_ITEM_NODE_NAMES)) {
        const firstLine = child.toArray()[0];
        addBlock(child, isElementNamed(firstLine, TEXT_BLOCK_NODE_NAMES) ? firstLine : undefined);
        visit(child);
        return;
      }
      if (isElementNamed(child, TEXT_BLOCK_NODE_NAMES)) {
        // 箇条書きの項目の 1 行目は、項目そのものとして並べてある。
        if (!(index === 0 && isElementNamed(node, LIST_ITEM_NODE_NAMES))) {
          addBlock(child, child);
        }
        return;
      }
      if (child instanceof Y.XmlElement) {
        visit(child);
      }
    });
  };
  visit(body);
  return blocks;
}

// ブロックの ID。まだ無ければ付ける。
export function ensureBlockId(element: Y.XmlElement): string {
  const existing = element.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (isBlockId(existing)) {
    return existing;
  }
  const yjsId = element._item?.id;
  if (!yjsId) {
    throw new Error("the block is not part of a note body");
  }
  const blockId = `${yjsId.client.toString(36)}-${yjsId.clock.toString(36)}`;
  element.setAttribute(BLOCK_ID_ATTRIBUTE, blockId);
  return blockId;
}

// その ID を持つブロック。同じ ID のブロックが複数あれば（2 台が同じブロックを別々の場所へ動かしたとき）、
// 本文で先に出てくる方。どのデバイスでも同じ方になる。
export function findBlock(body: Y.XmlFragment, blockId: string): Y.XmlElement | null {
  const visit = (node: Y.XmlFragment | Y.XmlElement): Y.XmlElement | null => {
    for (const child of node.toArray()) {
      if (!(child instanceof Y.XmlElement)) {
        continue;
      }
      const found = child.getAttribute(BLOCK_ID_ATTRIBUTE) === blockId ? child : visit(child);
      if (found) {
        return found;
      }
    }
    return null;
  };
  return visit(body);
}

// リンクの表示などに使う、ブロックの文字（箇条書きの項目は、その項目の行だけ）。
export function blockLineText(block: Y.XmlElement): string {
  const textSource = isElementNamed(block, LIST_ITEM_NODE_NAMES) ? block.toArray()[0] : block;
  return textSource instanceof Y.XmlElement ? nodePlainText(textSource) : "";
}

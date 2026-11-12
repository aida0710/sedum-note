// ブロックの ID の、Markdown での表し方。ID を持つブロックの行の末尾に「 ^ID」を書く（Obsidian と同じ書き方）。
//   段落・見出し        文字 ^ID
//   箇条書きの項目      - 文字 ^ID（子の項目より前の、その項目の行の末尾）

import type { JSONContent } from "@tiptap/core";
import { BLOCK_ID_ATTRIBUTE, isBlockId } from "../../core/notes/bodyBlocks";

const TEXT_BLOCK_TYPES = ["paragraph", "heading"];
// 行の末尾の「 ^ID」。行に ID の印だけがあるときは、前の空白が無い。
const BLOCK_ID_MARK_AT_END = /(?:^|\s+)\^([0-9a-z]+-[0-9a-z]+)$/;

function withMarkAtEnd(textBlock: JSONContent, blockId: string): JSONContent {
  return { ...textBlock, content: [...(textBlock.content ?? []), { type: "text", text: ` ^${blockId}` }] };
}

// 書き出す文書の、ID を持つブロックの行の末尾に、ID の印を足す。
export function withBlockIdMarks(node: JSONContent): JSONContent {
  const content = node.content?.map(withBlockIdMarks);
  const withContent = content ? { ...node, content } : node;
  const blockId: unknown = node.attrs?.[BLOCK_ID_ATTRIBUTE];
  if (!isBlockId(blockId)) {
    return withContent;
  }
  if (TEXT_BLOCK_TYPES.includes(node.type ?? "")) {
    return withMarkAtEnd(withContent, blockId);
  }
  const [firstLine, ...rest] = content ?? [];
  return firstLine?.type === "paragraph" ? { ...node, content: [withMarkAtEnd(firstLine, blockId), ...rest] } : withContent;
}

// 行の末尾の ID の印を外し、外した ID を返す。印が無ければ blockId は null。
function withoutMarkAtEnd(textBlock: JSONContent): { textBlock: JSONContent; blockId: string | null } {
  const inlineNodes = textBlock.content ?? [];
  const last = inlineNodes[inlineNodes.length - 1];
  const match = last?.type === "text" && typeof last.text === "string" ? BLOCK_ID_MARK_AT_END.exec(last.text) : null;
  if (!last || !match || !isBlockId(match[1])) {
    return { textBlock, blockId: null };
  }
  const remainingText = (last.text ?? "").slice(0, match.index);
  const remaining = remainingText === "" ? inlineNodes.slice(0, -1) : [...inlineNodes.slice(0, -1), { ...last, text: remainingText }];
  return { textBlock: { ...textBlock, content: remaining.length > 0 ? remaining : undefined }, blockId: match[1] };
}

function withBlockId(node: JSONContent, blockId: string | null): JSONContent {
  return blockId === null ? node : { ...node, attrs: { ...node.attrs, [BLOCK_ID_ATTRIBUTE]: blockId } };
}

// 読んだ文書の、行の末尾の ID の印を外す。keepsBlockIds なら、外した ID をそのブロックの属性にする。
// 今ある本文に足すとき（貼り付け、末尾への追加）は、同じ ID のブロックが増えないよう、ID を捨てる。
export function withImportedBlockIds(node: JSONContent, keepsBlockIds: boolean): JSONContent {
  const content = node.content?.map((child) => withImportedBlockIds(child, keepsBlockIds));
  const withContent = content ? { ...node, content } : node;
  if (TEXT_BLOCK_TYPES.includes(node.type ?? "")) {
    const { textBlock, blockId } = withoutMarkAtEnd(withContent);
    return withBlockId(textBlock, keepsBlockIds ? blockId : null);
  }
  // 箇条書きの項目の行の末尾の印は、項目の ID。
  const [firstLine, ...rest] = content ?? [];
  const firstLineId: unknown = firstLine?.attrs?.[BLOCK_ID_ATTRIBUTE];
  if ((node.type === "listItem" || node.type === "taskItem") && firstLine && isBlockId(firstLineId)) {
    return withBlockId({ ...node, content: [{ ...firstLine, attrs: { ...firstLine.attrs, [BLOCK_ID_ATTRIBUTE]: null } }, ...rest] }, firstLineId);
  }
  return withContent;
}

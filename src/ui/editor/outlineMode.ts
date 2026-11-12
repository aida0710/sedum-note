// アウトライン表示（アウトライナー型のメモ）。メモごとに選べ、選んだメモの本文は 1 つの箇条書きになる（すべての行が項目）。
// 項目は、Tab で下の階層へ、Shift+Tab で上の階層へ移り、折りたたみ・ズーム・ドラッグが使える。
// アウトライン表示かどうかはメモの項目（isOutline）に持つ。本文の形は、ふつうのメモの箇条書きと同じ。

import { Extension } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode, type Schema } from "@tiptap/pm/model";
import { type EditorState, Plugin, type Transaction } from "@tiptap/pm/state";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

const OUTLINE_LIST = "bulletList";
const OUTLINE_ITEM = "listItem";

type OutlineNodeTypes = { list: NonNullable<Schema["nodes"][string]>; item: NonNullable<Schema["nodes"][string]>; paragraph: NonNullable<Schema["nodes"][string]> };

function outlineNodeTypes(schema: Schema): OutlineNodeTypes {
  const { [OUTLINE_LIST]: list, [OUTLINE_ITEM]: item, paragraph } = schema.nodes;
  if (!list || !item || !paragraph) {
    throw new Error("the schema has no bullet list");
  }
  return { list, item, paragraph };
}

export function isOutlineBody(doc: ProseMirrorNode): boolean {
  return doc.childCount === 1 && doc.firstChild?.type.name === OUTLINE_LIST;
}

// 項目の中身。項目は段落で始まる決まりなので、段落でないブロック（表、コードなど）の前には空の段落を置く。
function itemContentOf(block: ProseMirrorNode, types: OutlineNodeTypes): ProseMirrorNode[] {
  if (block.type === types.paragraph) {
    return [block];
  }
  if (block.type.name === "heading") {
    return [types.paragraph.create(null, block.content)];
  }
  return [types.paragraph.create(), block];
}

type OutlineEntry = { content: ProseMirrorNode[]; children: OutlineEntry[]; headingLevel: number | null };

function itemOf(entry: OutlineEntry, types: OutlineNodeTypes): ProseMirrorNode {
  const children = entry.children.length > 0 ? [types.list.create(null, entry.children.map((child) => itemOf(child, types)))] : [];
  return types.item.create(null, [...entry.content, ...children]);
}

// ふつうの本文を、アウトライン（1 つの箇条書き）にする。見出しは親の項目にし、次の同じ段か上の段の見出しまでを
// その子にする。今ある箇条書きの項目は、そのまま項目になる。空の段落は捨てる。
export function outlineFromBody(doc: ProseMirrorNode): ProseMirrorNode {
  const types = outlineNodeTypes(doc.type.schema);
  const topLevel: OutlineEntry[] = [];
  // いま中にいる見出しの項目（外側から順）。
  const openHeadings: OutlineEntry[] = [];
  const siblings = () => openHeadings[openHeadings.length - 1]?.children ?? topLevel;
  doc.forEach((block) => {
    if (block.type === types.list) {
      block.forEach((item) => siblings().push({ content: itemChildren(item), children: [], headingLevel: null }));
      return;
    }
    if (block.type === types.paragraph && block.content.size === 0) {
      return;
    }
    const headingLevel = block.type.name === "heading" ? Number(block.attrs.level) : null;
    if (headingLevel !== null) {
      while (openHeadings.length > 0 && (openHeadings[openHeadings.length - 1]!.headingLevel ?? 0) >= headingLevel) {
        openHeadings.pop();
      }
    }
    const entry: OutlineEntry = { content: itemContentOf(block, types), children: [], headingLevel };
    siblings().push(entry);
    if (headingLevel !== null) {
      openHeadings.push(entry);
    }
  });
  const items = topLevel.length > 0 ? topLevel.map((entry) => itemOf(entry, types)) : [types.item.create(null, types.paragraph.create())];
  return doc.type.create(doc.attrs, types.list.create(null, items));
}

function itemChildren(item: ProseMirrorNode): ProseMirrorNode[] {
  const children: ProseMirrorNode[] = [];
  item.forEach((child) => children.push(child));
  return children;
}

// アウトラインの外に出たブロック（項目を箇条書きの外へ出す操作のあとなど）を項目に戻し、箇条書きを 1 つにつなぐ変更。
// すでにアウトラインなら null。カーソルは、戻した項目の中に残る。
function outlineRestoringTransaction(state: EditorState): Transaction | null {
  if (isOutlineBody(state.doc)) {
    return null;
  }
  const types = outlineNodeTypes(state.schema);
  const transaction = state.tr;
  // 後ろから直す（前の位置がずれない）。
  const blocks: Array<{ node: ProseMirrorNode; position: number }> = [];
  state.doc.forEach((node, position) => blocks.push({ node, position }));
  for (const { node, position } of blocks.reverse()) {
    if (node.type === types.list) {
      continue;
    }
    if (node.type === types.paragraph) {
      // 包むだけなので、段落の中のカーソルはそのまま残る。
      const range = transaction.doc.resolve(position + 1).blockRange();
      if (range) {
        transaction.wrap(range, [{ type: types.list }, { type: types.item }]);
      }
    } else {
      transaction.replaceWith(position, position + node.nodeSize, types.list.create(null, types.item.create(null, Fragment.from(itemContentOf(node, types)))));
    }
  }
  // 隣り合った箇条書きを、後ろからつなぐ。
  const boundaries: number[] = [];
  transaction.doc.forEach((_node, position, index) => {
    if (index > 0) {
      boundaries.push(position);
    }
  });
  boundaries.reverse().forEach((boundary) => transaction.join(boundary));
  return transaction;
}

// アウトライン表示のメモのエディタに入れる。編集のたびに、本文を 1 つの箇条書きに保つ。
export const OutlineMode = Extension.create({
  name: "outlineMode",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          // ほかのデバイスから届いた変更には手を出さない（次にこのデバイスで編集したときに直る）。
          const isLocalEdit = transactions.some((transaction) => transaction.docChanged) && !transactions.some((transaction) => transaction.getMeta(ySyncPluginKey));
          return isLocalEdit ? outlineRestoringTransaction(newState) : null;
        },
      }),
    ];
  },
});

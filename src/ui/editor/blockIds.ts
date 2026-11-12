// ブロックの ID（リンクの先に選ばれたブロックに付く属性。core/notes/bodyBlocks.ts）を、編集のあいだも
// 中身のある 1 つのブロックに付いたままにする。
//   行の途中で Enter: ID は前半に残り、後半には付かない。
//   行の先頭で Enter: 中身は下の行へ送られるので、分けずに上へ空の行を足して、ID を中身に付けたままにする。
//   複写して貼る: 同じ ID が 2 つになるので、前からあった方にだけ残す。切り取って貼ったときは、貼った方に残る。
// リンクから来たときに、そのブロックまで送って目立たせる操作（revealBlock）もここに置く。

import { type Editor, Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { BLOCK_ID_ATTRIBUTE, LINKABLE_BLOCK_NODE_NAMES } from "../../core/notes/bodyBlocks";

// ほかの Enter の処理（箇条書きの項目を分ける、など）より先に見る。
const ENTER_PRIORITY = 1000;

const revealedBlockKey = new PluginKey<number | null>("revealedBlock");

type BlockPosition = { position: number; node: ProseMirrorNode };

// ID を持つブロック。リンクと埋め込みのノードも、指す先を同じ名前の属性で持つので、ブロックの種類だけを見る。
function blocksWithId(doc: ProseMirrorNode): Array<BlockPosition & { blockId: string }> {
  const blocks: Array<BlockPosition & { blockId: string }> = [];
  doc.descendants((node, position) => {
    const blockId: unknown = node.attrs[BLOCK_ID_ATTRIBUTE];
    if (typeof blockId === "string" && LINKABLE_BLOCK_NODE_NAMES.includes(node.type.name)) {
      blocks.push({ position, node, blockId });
    }
    return true;
  });
  return blocks;
}

// カーソルが、ID を持つブロックの中身の先頭にあるなら、そのブロック。箇条書きの項目は、1 行目の先頭。
function blockWithIdStartingAtCursor(state: EditorState): BlockPosition | null {
  const { selection } = state;
  const { $from } = selection;
  if (!selection.empty || $from.parentOffset !== 0 || !$from.parent.isTextblock || $from.parent.content.size === 0) {
    return null;
  }
  if ($from.parent.attrs[BLOCK_ID_ATTRIBUTE]) {
    return { position: $from.before(), node: $from.parent };
  }
  const outerDepth = $from.depth - 1;
  if (outerDepth < 1 || $from.index(outerDepth) !== 0 || !$from.node(outerDepth).attrs[BLOCK_ID_ATTRIBUTE]) {
    return null;
  }
  return { position: $from.before(outerDepth), node: $from.node(outerDepth) };
}

function insertEmptyBlockAbove(editor: Editor): boolean {
  const block = blockWithIdStartingAtCursor(editor.state);
  if (!block) {
    return false;
  }
  // 行の先頭での Enter の、ふつうの結果と同じ形にする（段落と見出しの上には空の段落、項目の上には空の項目）。
  const emptyBlock = block.node.isTextblock ? editor.schema.nodes.paragraph?.create() : block.node.type.createAndFill();
  if (!emptyBlock) {
    return false;
  }
  editor.view.dispatch(editor.state.tr.insert(block.position, emptyBlock).scrollIntoView());
  return true;
}

// この編集で同じ ID のブロックが増えていたら、前からあった方だけに ID を残す変更を返す。
function removeDuplicatedIds(transactions: readonly Transaction[], oldState: EditorState, newState: EditorState): Transaction | null {
  const positionsById = new Map<string, number[]>();
  for (const block of blocksWithId(newState.doc)) {
    positionsById.set(block.blockId, [...(positionsById.get(block.blockId) ?? []), block.position]);
  }
  const duplicated = [...positionsById].filter(([, positions]) => positions.length > 1);
  if (duplicated.length === 0) {
    return null;
  }
  // 前からあったブロックの、今の位置。
  const keptPositionById = new Map<string, number>();
  for (const block of blocksWithId(oldState.doc)) {
    let position = block.position;
    let deleted = false;
    for (const transaction of transactions) {
      const mapped = transaction.mapping.mapResult(position, 1);
      position = mapped.pos;
      deleted ||= mapped.deletedAfter;
    }
    if (!deleted && !keptPositionById.has(block.blockId)) {
      keptPositionById.set(block.blockId, position);
    }
  }
  const transaction = newState.tr;
  for (const [blockId, positions] of duplicated) {
    const kept = keptPositionById.get(blockId);
    const keptPosition = kept !== undefined && positions.includes(kept) ? kept : positions[0];
    positions.filter((position) => position !== keptPosition).forEach((position) => transaction.setNodeAttribute(position, BLOCK_ID_ATTRIBUTE, null));
  }
  return transaction;
}

// 折りたたみで隠れているブロックを出すために、開く必要のあるノードの位置（折りたたんだ項目と見出し）。
function collapsedPositionsHiding(doc: ProseMirrorNode, blockPosition: number): number[] {
  const resolved = doc.resolve(blockPosition);
  const positions: number[] = [];
  for (let depth = 1; depth <= resolved.depth; depth += 1) {
    if (resolved.node(depth).attrs.collapsed) {
      positions.push(resolved.before(depth));
    }
  }
  // 見出しの折りたたみは、本文の直下で、次の同じ段か上の段の見出しまでを隠す。先の見出しをたどって、効いているものを集める。
  const topLevelIndex = resolved.index(0);
  let headingsAbove: Array<{ position: number; level: number; collapsed: boolean }> = [];
  let offset = 0;
  for (let index = 0; index <= topLevelIndex; index += 1) {
    const block = doc.child(index);
    if (block.type.name === "heading") {
      const level = Number(block.attrs.level);
      headingsAbove = headingsAbove.filter((heading) => heading.level < level);
      if (index < topLevelIndex) {
        headingsAbove.push({ position: offset, level, collapsed: Boolean(block.attrs.collapsed) });
      }
    }
    offset += block.nodeSize;
  }
  return [...positions, ...headingsAbove.filter((heading) => heading.collapsed).map((heading) => heading.position)];
}

// その ID のブロックまで本文を送り、カーソルを置いて目立たせる。ブロックが無ければ false。
export function revealBlock(editor: Editor, blockId: string): boolean {
  const block = blocksWithId(editor.state.doc).find((candidate) => candidate.blockId === blockId);
  if (!block) {
    return false;
  }
  const transaction = editor.state.tr;
  collapsedPositionsHiding(editor.state.doc, block.position).forEach((position) => transaction.setNodeAttribute(position, "collapsed", false));
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(block.position + 1))).setMeta(revealedBlockKey, block.position).scrollIntoView();
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}

export const BlockIds = Extension.create({
  name: "blockIds",
  priority: ENTER_PRIORITY,
  addGlobalAttributes() {
    return [{
      types: LINKABLE_BLOCK_NODE_NAMES,
      attributes: {
        [BLOCK_ID_ATTRIBUTE]: {
          default: null,
          keepOnSplit: false,
          parseHTML: (element) => element.getAttribute("data-block-id"),
          renderHTML: (attributes) => (attributes[BLOCK_ID_ATTRIBUTE] ? { "data-block-id": attributes[BLOCK_ID_ATTRIBUTE] as string } : {}),
        },
      },
    }];
  },
  addKeyboardShortcuts() {
    return { Enter: ({ editor }) => insertEmptyBlockAbove(editor) };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, oldState, newState) => {
          // ほかのデバイスから届いた変更には手を出さない（デバイスごとに別の方を残すと、マージで食い違う）。
          const isLocalEdit = transactions.some((transaction) => transaction.docChanged) && !transactions.some((transaction) => transaction.getMeta(ySyncPluginKey));
          return isLocalEdit ? removeDuplicatedIds(transactions, oldState, newState) : null;
        },
      }),
      // リンクから来て目立たせているブロックの位置。次に選択か本文が変わるまで目立たせる。
      new Plugin<number | null>({
        key: revealedBlockKey,
        state: {
          init: () => null,
          apply: (transaction, revealedPosition) => {
            const requested = transaction.getMeta(revealedBlockKey) as number | undefined;
            if (requested !== undefined) {
              return requested;
            }
            return transaction.docChanged || transaction.selectionSet ? null : revealedPosition;
          },
        },
        props: {
          decorations: (state) => {
            const position = revealedBlockKey.getState(state) ?? null;
            const node = position === null ? null : state.doc.nodeAt(position);
            return position !== null && node ? DecorationSet.create(state.doc, [Decoration.node(position, position + node.nodeSize, { class: "revealed-block" })]) : null;
          },
        },
      }),
    ];
  },
});

// ブロック（箇条書きの項目か、本文の直下のブロック）を 1 つの単位で扱う操作。キー（blockKeys.ts）と、
// 持ち手のメニュー（BlockMenu.tsx）から使う。
//   上下に動かす: 同じ入れ物の中の隣のブロックと入れ替える。箇条書きの項目は子ごと動く。
//   複製: すぐ下に同じものを入れ、カーソルを複製したほうへ移す（ブロックの ID は、前からあったほうに残る。blockIds.ts）。
//   変換: 本文・見出し・箇条書き・引用・コードなどに変える。
//   削除

import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { type EditorState, NodeSelection, type Selection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { isInsideZoom } from "./zoom";

const LIST_ITEM_TYPES = ["listItem", "taskItem"];

export type BlockTarget = { position: number; node: ProseMirrorNode };

function isListItem(node: ProseMirrorNode): boolean {
  return LIST_ITEM_TYPES.includes(node.type.name);
}

// 位置にあるブロック。箇条書きの中なら、いちばん内側の項目。それ以外は本文の直下のブロック。
export function blockAt(state: EditorState, position: number): BlockTarget | null {
  const resolved = state.doc.resolve(position);
  for (let depth = resolved.depth; depth >= 1; depth -= 1) {
    if (isListItem(resolved.node(depth))) {
      return { position: resolved.before(depth), node: resolved.node(depth) };
    }
  }
  if (resolved.depth >= 1) {
    return { position: resolved.before(1), node: resolved.node(1) };
  }
  // 本文の直下のブロックそのもの（写真などを選んだとき）。
  const node = state.doc.nodeAt(position);
  return node ? { position, node } : null;
}

// カーソルのあるブロック。写真などのブロックを選んでいるときは、そのブロック。
export function blockAtCursor(state: EditorState): BlockTarget | null {
  return blockAt(state, state.selection.from);
}

// ブロックが from から to へ移ったあとの選択。ブロックの中にあった選択は、ブロックと一緒に動かす。
function selectionMovedWithBlock(transaction: Transaction, previous: Selection, block: BlockTarget, newPosition: number): Selection | null {
  const end = block.position + block.node.nodeSize;
  if (previous instanceof NodeSelection && previous.from === block.position) {
    return NodeSelection.create(transaction.doc, newPosition);
  }
  if (previous.from < block.position || previous.to > end) {
    return null;
  }
  return TextSelection.create(transaction.doc, newPosition + (previous.anchor - block.position), newPosition + (previous.head - block.position));
}

// ブロックを、同じ入れ物の中の上（-1）か下（1）の隣と入れ替える。端のときと、ズームの外へ出るときは動かさない（false）。
export function moveBlock(editor: Editor, block: BlockTarget, direction: -1 | 1): boolean {
  const { state } = editor;
  const resolved = state.doc.resolve(block.position);
  const siblingIndex = resolved.index() + direction;
  if (siblingIndex < 0 || siblingIndex >= resolved.parent.childCount) {
    return false;
  }
  const sibling = resolved.parent.child(siblingIndex);
  const newPosition = direction === -1 ? block.position - sibling.nodeSize : block.position + sibling.nodeSize;
  const end = block.position + block.node.nodeSize;
  if (!isInsideZoom(state, Math.min(block.position, newPosition), Math.max(end, newPosition + block.node.nodeSize))) {
    return false;
  }
  const transaction = state.tr.delete(block.position, end).insert(newPosition, block.node);
  const selection = selectionMovedWithBlock(transaction, state.selection, block, newPosition);
  if (selection) {
    transaction.setSelection(selection);
  }
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}

// ブロックのすぐ下に同じものを入れ、カーソル（選択）を複製したほうの同じ所へ移す。
export function duplicateBlock(editor: Editor, block: BlockTarget): boolean {
  const { state } = editor;
  const copyPosition = block.position + block.node.nodeSize;
  const transaction = state.tr.insert(copyPosition, block.node);
  const selection = selectionMovedWithBlock(transaction, state.selection, block, copyPosition)
    ?? TextSelection.near(transaction.doc.resolve(copyPosition + 1));
  editor.view.dispatch(transaction.setSelection(selection).scrollIntoView());
  return true;
}

// ブロックのすぐ下に「/」だけの行を足し、その後ろにカーソルを置く（「/」の候補が開く。行の左の「＋」から使う）。
// 箇条書きの項目なら、同じ箇条書きに項目を足す。ブロックが空の段落なら、新しい行は足さずに、そこに「/」を打つ。
export function startBlockBelow(editor: Editor, block: BlockTarget): boolean {
  const { state } = editor;
  const { schema } = state;
  const paragraphType = schema.nodes.paragraph;
  if (!paragraphType) {
    return false;
  }
  const slash = schema.text("/");
  const transaction = state.tr;
  let cursor: number;
  if (block.node.type === paragraphType && block.node.content.size === 0) {
    transaction.insert(block.position + 1, slash);
    cursor = block.position + 2;
  } else {
    const end = block.position + block.node.nodeSize;
    const newBlock = isListItem(block.node)
      ? block.node.type.create(null, paragraphType.create(null, slash))
      : paragraphType.create(null, slash);
    transaction.insert(end, newBlock);
    // 新しいブロックに入り、（項目なら中の段落にも入り、）「/」の後ろ。
    cursor = end + (isListItem(block.node) ? 3 : 2);
  }
  editor.view.dispatch(transaction.setSelection(TextSelection.create(transaction.doc, cursor)).scrollIntoView());
  editor.view.focus();
  return true;
}

export function deleteBlock(editor: Editor, block: BlockTarget): boolean {
  const transaction = editor.state.tr.delete(block.position, block.position + block.node.nodeSize);
  const position = Math.min(block.position, transaction.doc.content.size);
  editor.view.dispatch(transaction.setSelection(TextSelection.near(transaction.doc.resolve(position))).scrollIntoView());
  editor.view.focus();
  return true;
}

export type BlockKind = "paragraph" | "heading1" | "heading2" | "heading3" | "bulletList" | "orderedList" | "taskList" | "blockquote" | "codeBlock";

export const BLOCK_KINDS: BlockKind[] = ["paragraph", "heading1", "heading2", "heading3", "bulletList", "orderedList", "taskList", "blockquote", "codeBlock"];

// 変換できるブロックか。文字の段落・見出し・コード・引用と、箇条書きの項目。写真や表などは変換しない。
export function canChangeKind(block: BlockTarget): boolean {
  return block.node.isTextblock || isListItem(block.node) || block.node.type.name === "blockquote";
}

// いまの種類。箇条書きの項目は、入っている箇条書きの種類。
export function kindOf(state: EditorState, block: BlockTarget): BlockKind | null {
  const { node } = block;
  if (isListItem(node)) {
    const listName = state.doc.resolve(block.position).parent.type.name;
    return listName === "orderedList" ? "orderedList" : listName === "taskList" ? "taskList" : "bulletList";
  }
  if (node.type.name === "heading") {
    const level = Number(node.attrs.level);
    return level === 1 ? "heading1" : level === 2 ? "heading2" : level === 3 ? "heading3" : null;
  }
  return ({ paragraph: "paragraph", blockquote: "blockquote", codeBlock: "codeBlock" } as Record<string, BlockKind>)[node.type.name] ?? null;
}

// ブロックを、ほかの種類に変える。今の選択が何行かにまたがっていて、このブロックを含むなら、選んだ行を全部変える
// （何行かを選んでから持ち手のメニューで「箇条書き」を選ぶと、全部がまとめて 1 つの箇条書きになる）。
export function changeBlockKind(editor: Editor, block: BlockTarget, kind: BlockKind): boolean {
  const { selection } = editor.state;
  const end = block.position + block.node.nodeSize;
  const coversBlock = !selection.empty && selection.from < end && selection.to > block.position;
  // 今と同じ種類を選んだときは変えない（箇条書きの「箇条書き」は、外すことになるため）。
  if (!coversBlock && kindOf(editor.state, block) === kind) {
    return true;
  }
  const chain = editor.chain().focus();
  if (!coversBlock) {
    chain.setTextSelection(TextSelection.near(editor.state.doc.resolve(block.position + 1)).from);
  }
  switch (kind) {
    case "bulletList":
      return chain.toggleBulletList().run();
    case "orderedList":
      return chain.toggleOrderedList().run();
    case "taskList":
      return chain.toggleTaskList().run();
    case "paragraph":
      return chain.clearNodes().run();
    case "blockquote":
      return chain.clearNodes().setBlockquote().run();
    case "codeBlock":
      return chain.clearNodes().setCodeBlock().run();
    default:
      return chain.clearNodes().setHeading({ level: Number(kind.slice("heading".length)) as 1 | 2 | 3 }).run();
  }
}

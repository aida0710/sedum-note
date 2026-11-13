// 箇条書きの項目の中へ、同じ種類の箇条書き（Markdown の「- 」「1. 」「- [ ] 」の行）を貼ったとき、入れ子にせず、同じ段の項目として入れる。
// そのまま入れると、今の項目の中に新しい箇条書きができて印が二重に見え、空の項目に貼ると空の項目も残っていた。

import type { Editor, JSONContent } from "@tiptap/react";
import { Fragment, type Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { PASTED_CONTENT_META } from "./pasteUndoStep";

const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

// 貼る箇条書きの、端から最初の段落までに開いておく段の数（箇条書き・項目・段落）。開いた段は、貼る先の同じ段につながる。
function depthToTextblock(list: ProseMirrorNode, side: "first" | "last"): number {
  let depth = 1;
  for (let node: ProseMirrorNode | null = list; node && !node.isTextblock; depth += 1) {
    node = side === "first" ? node.firstChild : node.lastChild;
  }
  return depth - 1;
}

// 入れたら true。貼る中身が箇条書き 1 つでなかったり、カーソルが同じ種類の項目の最初の段落に無かったりすれば、何もせず false。
export function insertListAsSiblingItems(editor: Editor, blocks: JSONContent[]): boolean {
  const [onlyBlock] = blocks;
  if (blocks.length !== 1 || !onlyBlock?.type || !LIST_TYPES.has(onlyBlock.type)) {
    return false;
  }
  const { state } = editor;
  const { $from } = state.selection;
  // 段落 → 項目 → 箇条書き の順に外へ。
  const itemDepth = $from.depth - 1;
  if (itemDepth < 2 || $from.index(itemDepth) !== 0 || $from.node(itemDepth - 1).type.name !== onlyBlock.type) {
    return false;
  }
  const list = state.schema.nodeFromJSON(onlyBlock);
  // 空の項目に貼るなら、最初の項目の文字をその項目に入れる。文字のある項目なら、その項目の後ろに項目として足す。
  const openStart = $from.parent.content.size === 0 ? depthToTextblock(list, "first") : 1;
  const slice = new Slice(Fragment.from(list), openStart, depthToTextblock(list, "last"));
  editor.view.dispatch(state.tr.replaceSelection(slice).setMeta(PASTED_CONTENT_META, true).scrollIntoView());
  return true;
}

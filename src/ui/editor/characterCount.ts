// 本文の文字数の数え方。改行と空白は数えない。絵文字などは見た目の 1 文字を 1 と数える。

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

const characterSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function countCharacters(text: string): number {
  let count = 0;
  for (const _character of characterSegmenter.segment(text.replace(/\s/g, ""))) {
    count += 1;
  }
  return count;
}

// いちばん上の段落ごとの文字数。ProseMirror の文書は、打っても変わらなかった段落のノードをそのまま使い回すので、
// ノードごとに覚えておけば、打つたびには変わった段落だけを数え直せばよい（長いメモで、打つたびに全体を数え直すと重い）。
const countOfTopLevelNode = new WeakMap<ProseMirrorNode, number>();

// 段落の間の区切りは空白として数えないので、段落ごとに数えて足しても、全体を 1 度に数えた数と同じになる。
export function countDocumentCharacters(doc: ProseMirrorNode): number {
  let total = 0;
  doc.forEach((node) => {
    let count = countOfTopLevelNode.get(node);
    if (count === undefined) {
      count = countCharacters(textOfTopLevelNode(node));
      countOfTopLevelNode.set(node, count);
    }
    total += count;
  });
  return total;
}

// 文書の textBetween と同じ文字を、1 つの段落について取る（中身の無いノードは、leafText があればその文字）。
function textOfTopLevelNode(node: ProseMirrorNode): string {
  if (node.isLeaf) {
    return node.type.spec.leafText?.(node) ?? "";
  }
  return node.textBetween(0, node.content.size, "\n");
}

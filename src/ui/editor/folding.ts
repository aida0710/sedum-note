// 折りたたみ。子の項目を持つ箇条書きと、見出しに、開け閉めの印を出す。
//   箇条書き: 折りたたむと、その項目の中のリスト（子の項目）を隠す。
//   見出し: 折りたたむと、次の同じ段か上の段の見出しまでのブロックを隠す。
// 折りたたんだかどうかは本文の属性（collapsed）に持つので、同期される。隠すのは表示だけで、中身は消えない。

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { translate } from "../i18n/translate";

const LIST_ITEM_TYPES = ["listItem", "taskItem"];
const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);
const FOLDABLE_TYPES = [...LIST_ITEM_TYPES, "heading"];

const foldingKey = new PluginKey("folding");

function hasNestedList(listItem: ProseMirrorNode): boolean {
  let nested = false;
  listItem.forEach((child) => { nested ||= LIST_TYPES.has(child.type.name); });
  return nested;
}

function foldToggle(view: EditorView, position: number, collapsed: boolean): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `fold-toggle${collapsed ? " collapsed" : ""}`;
  button.contentEditable = "false";
  button.setAttribute("aria-label", translate(collapsed ? "editor.unfold" : "editor.fold"));
  button.setAttribute("aria-expanded", String(!collapsed));
  // 押しても、エディタの選択を動かさない。
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => view.dispatch(view.state.tr.setNodeAttribute(position, "collapsed", !collapsed)));
  return button;
}

function toggleDecoration(position: number, collapsed: boolean): Decoration {
  // 印はノードの中の先頭に置く。開け閉めで作り直すよう、状態を key に入れる。
  return Decoration.widget(position + 1, (view) => foldToggle(view, position, collapsed), { side: -1, key: `fold-${collapsed}`, ignoreSelection: true });
}

function foldingDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, position) => {
    if (LIST_ITEM_TYPES.includes(node.type.name) && hasNestedList(node)) {
      decorations.push(toggleDecoration(position, Boolean(node.attrs.collapsed)));
      if (node.attrs.collapsed) {
        decorations.push(Decoration.node(position, position + node.nodeSize, { class: "collapsed-item" }));
      }
    }
    return true;
  });
  // 見出しの折りたたみは、文書の直下のブロックだけを対象にする（表や引用の中の見出しは扱わない）。
  let foldingHeadingLevel: number | null = null;
  doc.forEach((block, offset) => {
    const isHeading = block.type.name === "heading";
    if (isHeading && foldingHeadingLevel !== null && Number(block.attrs.level) <= foldingHeadingLevel) {
      foldingHeadingLevel = null;
    }
    if (foldingHeadingLevel !== null) {
      decorations.push(Decoration.node(offset, offset + block.nodeSize, { class: "folded-block" }));
      return;
    }
    if (isHeading) {
      decorations.push(toggleDecoration(offset, Boolean(block.attrs.collapsed)));
      if (block.attrs.collapsed) {
        foldingHeadingLevel = Number(block.attrs.level);
      }
    }
  });
  return DecorationSet.create(doc, decorations);
}

export const Folding = Extension.create({
  name: "folding",
  addGlobalAttributes() {
    return [{
      types: FOLDABLE_TYPES,
      attributes: {
        collapsed: {
          default: false,
          parseHTML: (element) => element.getAttribute("data-collapsed") === "true",
          renderHTML: (attributes) => (attributes.collapsed ? { "data-collapsed": "true" } : {}),
        },
      },
    }];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: foldingKey,
        state: {
          init: (_config, state) => foldingDecorations(state.doc),
          apply: (transaction, decorations) => (transaction.docChanged ? foldingDecorations(transaction.doc) : decorations),
        },
        props: {
          decorations: (state) => foldingKey.getState(state) as DecorationSet,
        },
      }),
    ];
  },
});

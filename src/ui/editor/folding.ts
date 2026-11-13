// 折りたたみ。子の項目を持つ箇条書きと、見出しに、開け閉めの印を出す。
//   箇条書き: 折りたたむと、その項目の中のリスト（子の項目）を隠す。
//   見出し: 折りたたむと、次の同じ段か上の段の見出しまでのブロックを隠す。
// 折りたたんだかどうかは本文の属性（collapsed）に持つので、同期される。隠すのは表示だけで、中身は消えない。

import { type Editor, Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { FOLDED_ATTRIBUTE } from "../../core/notes/bodyContentChange";
import { translate } from "../i18n/translate";
import { editorShortcutPlugin } from "./editorShortcutPlugin";

const LIST_ITEM_TYPES = ["listItem", "taskItem"];
const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);
const FOLDABLE_TYPES = [...LIST_ITEM_TYPES, "heading"];

// 開け閉めの印。lucide の chevron-right と同じ形（左の列の開け閉めの印と同じ）。開いているときは、CSS で下向きに回す。
// 大きさは、見出しのズームのボタンのアイコン（zoom.ts）と同じ。
const CHEVRON_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

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
  button.innerHTML = CHEVRON_ICON_SVG;
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

// 見出しのセクションに、たためる中身（次の同じ段か上の段の見出しまでのブロック）があるか。
function hasSectionContent(doc: ProseMirrorNode, headingIndex: number): boolean {
  const next = headingIndex + 1 < doc.childCount ? doc.child(headingIndex + 1) : null;
  return next !== null && !(next.type.name === "heading" && Number(next.attrs.level) <= Number(doc.child(headingIndex).attrs.level));
}

// 位置が、たたんで隠れた所の中なら、その外の見えている所（たたんだ項目の最初の行か、見出しの行の末尾）。隠れていなければ、そのまま。
function positionOutsideFolds(doc: ProseMirrorNode, position: number): number {
  const resolved = doc.resolve(position);
  for (let depth = 1; depth <= resolved.depth; depth += 1) {
    const node = resolved.node(depth);
    // 項目の最初の子（題の行）は見えていて、そのあとの子（子のリスト）が隠れる。
    if (LIST_ITEM_TYPES.includes(node.type.name) && node.attrs.collapsed && resolved.index(depth) > 0 && node.firstChild) {
      return resolved.before(depth) + 2 + node.firstChild.content.size;
    }
  }
  let foldingHeading: { position: number; level: number; size: number } | null = null;
  let offset = 0;
  for (let index = 0; index < resolved.index(0); index += 1) {
    const block = doc.child(index);
    if (block.type.name === "heading") {
      const level = Number(block.attrs.level);
      if (foldingHeading === null || level <= foldingHeading.level) {
        foldingHeading = block.attrs.collapsed ? { position: offset, level, size: block.content.size } : null;
      }
    }
    offset += block.nodeSize;
  }
  const current = resolved.depth > 0 ? doc.child(resolved.index(0)) : null;
  const endsFolding = current?.type.name === "heading" && foldingHeading !== null && Number(current.attrs.level) <= foldingHeading.level;
  return foldingHeading !== null && !endsFolding ? foldingHeading.position + 1 + foldingHeading.size : position;
}

// 折りたたみで隠れている位置を出すために、開く必要のあるノードの位置（折りたたんだ項目と見出し）。
export function collapsedPositionsHiding(doc: ProseMirrorNode, hiddenPosition: number): number[] {
  const resolved = doc.resolve(hiddenPosition);
  const positions: number[] = [];
  for (let depth = 1; depth <= resolved.depth; depth += 1) {
    const node = resolved.node(depth);
    // たたんだ項目が隠すのは、最初の子（題の行）より後ろだけ。
    if (LIST_ITEM_TYPES.includes(node.type.name) && node.attrs.collapsed && resolved.index(depth) > 0) {
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

// 本文の折りたためるもの（子の項目を持つ箇条書きの項目と、中身のある、本文の直下の見出し）を、全部たたむか全部開く。
// たたんでカーソルが隠れた所に残ったら、見えている所へ移す（隠れた所に打った文字が入らないように）。
export function setAllFolded(editor: Editor, collapsed: boolean): boolean {
  const { state } = editor;
  const transaction = state.tr;
  state.doc.descendants((node, position) => {
    if (LIST_ITEM_TYPES.includes(node.type.name) && hasNestedList(node) && Boolean(node.attrs.collapsed) !== collapsed) {
      transaction.setNodeAttribute(position, "collapsed", collapsed);
    }
    return true;
  });
  state.doc.forEach((block, offset, index) => {
    if (block.type.name === "heading" && Boolean(block.attrs.collapsed) !== collapsed && (!collapsed || hasSectionContent(state.doc, index))) {
      transaction.setNodeAttribute(offset, "collapsed", collapsed);
    }
  });
  if (!transaction.docChanged) {
    return false;
  }
  const head = positionOutsideFolds(transaction.doc, transaction.selection.head);
  if (head !== transaction.selection.head) {
    transaction.setSelection(TextSelection.create(transaction.doc, head));
  }
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}

export const Folding = Extension.create({
  name: "folding",
  addGlobalAttributes() {
    return [{
      types: FOLDABLE_TYPES,
      attributes: {
        [FOLDED_ATTRIBUTE]: {
          default: false,
          parseHTML: (element) => element.getAttribute("data-collapsed") === "true",
          renderHTML: (attributes) => (attributes.collapsed ? { "data-collapsed": "true" } : {}),
        },
      },
    }];
  },
  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      // すべて折りたたむ・すべて開く（キーは設定で変えられる。メモの「…」のメニューにも出す）。
      editorShortcutPlugin({ foldAll: () => setAllFolded(editor, true), unfoldAll: () => setAllFolded(editor, false) }),
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

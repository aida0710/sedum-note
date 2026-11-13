// 折りたたみ。子の項目を持つ箇条書きと、見出しに、開け閉めの印を出す。
//   箇条書き: 折りたたむと、その項目の中のリスト（子の項目）を隠す。
//   見出し: 折りたたむと、次の同じ段か上の段の見出しまでのブロックを隠す。
// 折りたたんだかどうかは本文の属性（collapsed）に持つので、同期される。隠すのは表示だけで、中身は消えない。

import { type Editor, Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { FOLDED_ATTRIBUTE } from "../../core/notes/bodyContentChange";
import { type MessageKey, translate } from "../i18n/translate";
import { editorKeymapName, type ShortcutKeys } from "../shared/shortcutKeys";

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

// メモの「…」の「すべて折りたたむ」「すべて開く」にも、このキーを出す。
export const FOLD_ALL_KEYS: ShortcutKeys = { key: "[", alt: true };
export const UNFOLD_ALL_KEYS: ShortcutKeys = { key: "]", alt: true };

export const FOLDING_SHORTCUTS: Array<{ id: string; label: MessageKey; keys: ShortcutKeys; run: (editor: Editor) => boolean }> = [
  { id: "foldAll", label: "editor.foldAll", keys: FOLD_ALL_KEYS, run: (editor) => setAllFolded(editor, true) },
  { id: "unfoldAll", label: "editor.unfoldAll", keys: UNFOLD_ALL_KEYS, run: (editor) => setAllFolded(editor, false) },
];

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
  addKeyboardShortcuts() {
    return Object.fromEntries(FOLDING_SHORTCUTS.map((shortcut) => [editorKeymapName(shortcut.keys), () => shortcut.run(this.editor)]));
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

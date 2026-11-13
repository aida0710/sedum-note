// ブロックをドラッグして並べ替える持ち手。本文の直下のブロック（段落、見出し、表など）か、箇条書きの項目に
// マウスを乗せると、左に持ち手を出す。持ち手をつかんで動かすと、そのブロックごと（項目は子ごと）移る
// （落とす位置の線は、エディタの既定のものが出る）。マウスで使うもので、スマホの画面では出ない。
//
// マウスの動きは、本文の左の余白も含む、本文の列全体（.document-scroll）で見る。エディタの要素だけで見ると、
// 持ち手へ向かって本文の左へ出た所で、持ち手に届く前に消えてしまう。

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { translate } from "../i18n/translate";

const HANDLE_CLASS = "block-drag-handle";
// 持ち手の大きさ（px）。CSS（.block-drag-handle）と同じ値。つかみやすいよう、本文の 1 行ぶんの高さにする。
const HANDLE_WIDTH = 20;
const HANDLE_HEIGHT = 24;
// 持ち手の右端と、ブロックの左端との間（px）。間に出る印をよける。
//   見出し: 折りたたみの印（左へ 20px まで）と、ズームのボタン（左へ 44px まで）。
//   箇条書きの項目: 行頭の印と、折りたたみの印（左へ 34px まで）。
const HANDLE_GAP = { heading: 48, listItem: 38, other: 6 };
// 持ち手を探す本文の列。無いとき（本文だけを出す画面）は、エディタを包む要素で見る。
const HOVER_AREA_SELECTOR = ".document-scroll";

const LIST_ITEM_TYPES = ["listItem", "taskItem"];

// 持ち手（6 つの点）。lucide の grip-vertical と同じ形。
const GRIP_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="5" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="9" cy="19" r="1.6"/><circle cx="15" cy="5" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="15" cy="19" r="1.6"/></svg>';

type DraggableBlock = { position: number; node: ProseMirrorNode; element: HTMLElement };

// マウスの高さにある、動かせるブロック。箇条書きの中なら、いちばん内側の項目。それ以外は本文の直下のブロック。無ければ null。
function draggableBlockAt(view: EditorView, mouse: { clientX: number; clientY: number }): DraggableBlock | null {
  const editorBox = view.dom.getBoundingClientRect();
  if (mouse.clientY < editorBox.top || mouse.clientY > editorBox.bottom) {
    return null;
  }
  // 左の余白にマウスがあっても拾えるよう、横は本文の中に収める。
  const left = Math.min(Math.max(mouse.clientX, editorBox.left + 1), editorBox.right - 1);
  const found = view.posAtCoords({ left, top: mouse.clientY });
  if (!found) {
    return null;
  }
  const resolved = view.state.doc.resolve(found.pos);
  let position = resolved.depth === 0 ? found.inside : resolved.before(1);
  for (let depth = resolved.depth; depth >= 1; depth -= 1) {
    if (LIST_ITEM_TYPES.includes(resolved.node(depth).type.name)) {
      position = resolved.before(depth);
      break;
    }
  }
  const node = position < 0 ? null : view.state.doc.nodeAt(position);
  const element = position < 0 ? null : view.nodeDOM(position);
  return node && element instanceof HTMLElement ? { position, node, element } : null;
}

function handleGapOf(node: ProseMirrorNode): number {
  if (node.type.name === "heading") {
    return HANDLE_GAP.heading;
  }
  return LIST_ITEM_TYPES.includes(node.type.name) ? HANDLE_GAP.listItem : HANDLE_GAP.other;
}

// ブロックの中の、最初の文字の段落（項目なら題の行）の中の位置。無ければ null。
function firstTextPositionInside(block: DraggableBlock): number | null {
  let textPosition: number | null = null;
  block.node.descendants((child, offset) => {
    if (textPosition === null && child.isTextblock) {
      textPosition = block.position + 1 + offset + 1;
    }
    return textPosition === null;
  });
  return textPosition;
}

// ブロックの 1 行目の縦の中心（画面の座標）。持ち手をこの高さにそろえる。文字の無いブロック（写真、表など）は上の端の近く。
function firstLineMiddle(view: EditorView, block: DraggableBlock): number {
  const textPosition = block.node.isTextblock ? block.position + 1 : firstTextPositionInside(block);
  const blockBox = block.element.getBoundingClientRect();
  if (textPosition === null) {
    return blockBox.top + Math.min(blockBox.height, HANDLE_HEIGHT) / 2;
  }
  const line = view.coordsAtPos(textPosition);
  return (line.top + line.bottom) / 2;
}

function createHandle(): HTMLElement {
  const handle = document.createElement("div");
  handle.className = HANDLE_CLASS;
  handle.draggable = true;
  handle.contentEditable = "false";
  handle.setAttribute("role", "button");
  handle.setAttribute("aria-label", translate("editor.dragBlock"));
  handle.title = translate("editor.dragBlock");
  handle.innerHTML = GRIP_ICON_SVG;
  handle.hidden = true;
  return handle;
}

export const BlockDragHandle = Extension.create({
  name: "blockDragHandle",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view: (view) => {
          const container = view.dom.parentElement;
          if (!container) {
            return {};
          }
          const hoverArea = container.closest<HTMLElement>(HOVER_AREA_SELECTOR) ?? container;
          const handle = createHandle();
          container.appendChild(handle);
          // 持ち手を出しているブロックの位置。ドラッグを始めるときに、このブロックを選ぶ。
          let hoveredPosition: number | null = null;
          // 最後にマウスがあった位置と、打ち始めて隠したか。打って本文の形が変わると、マウスが止まっていても
          // ブラウザが mousemove を送ってくるので、マウスが本当に動くまでは出し直さない。
          let lastPointer = { clientX: -1, clientY: -1 };
          let hiddenForTyping = false;

          const hideHandle = () => {
            handle.hidden = true;
            hoveredPosition = null;
          };
          const hideForTyping = () => {
            hiddenForTyping = true;
            hideHandle();
          };
          const showHandleAt = (event: MouseEvent) => {
            const pointerMoved = event.clientX !== lastPointer.clientX || event.clientY !== lastPointer.clientY;
            lastPointer = { clientX: event.clientX, clientY: event.clientY };
            if (hiddenForTyping && !pointerMoved) {
              return;
            }
            hiddenForTyping = false;
            // 持ち手の上では、いま出しているブロックのままにする（持ち手は本文の左の外にあり、そこから探すと別のブロックに当たる）。
            if (event.target instanceof Node && handle.contains(event.target)) {
              return;
            }
            const block = view.editable ? draggableBlockAt(view, event) : null;
            if (!block) {
              hideHandle();
              return;
            }
            hoveredPosition = block.position;
            const containerBox = container.getBoundingClientRect();
            const blockBox = block.element.getBoundingClientRect();
            handle.style.top = `${firstLineMiddle(view, block) - HANDLE_HEIGHT / 2 - containerBox.top}px`;
            handle.style.left = `${blockBox.left - containerBox.left - handleGapOf(block.node) - HANDLE_WIDTH}px`;
            handle.hidden = false;
          };
          const startDragging = (event: DragEvent) => {
            if (hoveredPosition === null || !event.dataTransfer) {
              return;
            }
            const selection = NodeSelection.create(view.state.doc, hoveredPosition);
            view.dispatch(view.state.tr.setSelection(selection));
            const draggedElement = view.nodeDOM(hoveredPosition);
            if (draggedElement instanceof HTMLElement) {
              event.dataTransfer.setDragImage(draggedElement, 0, 0);
            }
            event.dataTransfer.effectAllowed = "move";
            // 中身は使わないが、何か入れないとドラッグが始まらないブラウザがある。
            event.dataTransfer.setData("text/plain", draggedElement?.textContent ?? "");
            // 落としたときに、エディタがこのブロックを元の場所から消して、落とした場所へ入れる。
            view.dragging = { slice: selection.content(), move: true };
          };

          hoverArea.addEventListener("mousemove", showHandleAt);
          hoverArea.addEventListener("mouseleave", hideHandle);
          // 打っている間は、文字の邪魔にならないよう隠す（マウスを動かすとまた出る）。日本語の変換で入る文字は
          // keydown を伴わないことがあるので、input でも隠す。
          view.dom.addEventListener("keydown", hideForTyping);
          view.dom.addEventListener("input", hideForTyping);
          handle.addEventListener("dragstart", startDragging);
          handle.addEventListener("dragend", hideHandle);
          return {
            destroy: () => {
              hoverArea.removeEventListener("mousemove", showHandleAt);
              hoverArea.removeEventListener("mouseleave", hideHandle);
              view.dom.removeEventListener("keydown", hideForTyping);
              view.dom.removeEventListener("input", hideForTyping);
              handle.remove();
            },
          };
        },
      }),
    ];
  },
});

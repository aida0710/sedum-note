// ブロックをドラッグして並べ替える持ち手。本文の直下のブロック（段落、見出し、リスト、表など）にマウスを乗せると、
// 左に持ち手を出す。持ち手をつかんで動かすと、そのブロックごと移る（落とす位置の線は、エディタの既定のものが出る）。
// マウスで使うもので、スマホの画面では出ない。

import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { translate } from "../i18n/translate";

// 持ち手を、ブロックの左端からどれだけ左に置くか（px）。折りたたみの印（左へ 34px まで）と重ならない位置にする。
const HANDLE_OFFSET_LEFT = 50;
const HANDLE_CLASS = "block-drag-handle";

// マウスのある高さにある、本文の直下のブロックの位置。無ければ null。
function topLevelBlockAt(view: EditorView, clientY: number): { position: number; element: HTMLElement } | null {
  const editorBox = view.dom.getBoundingClientRect();
  // 左の余白にマウスがあっても拾えるよう、横は本文の中の位置で探す。
  const found = view.posAtCoords({ left: editorBox.left + 1, top: clientY });
  if (!found) {
    return null;
  }
  const resolved = view.state.doc.resolve(found.pos);
  const position = resolved.depth === 0 ? found.inside : resolved.before(1);
  const element = position < 0 ? null : view.nodeDOM(position);
  return element instanceof HTMLElement ? { position, element } : null;
}

function createHandle(): HTMLElement {
  const handle = document.createElement("div");
  handle.className = HANDLE_CLASS;
  handle.draggable = true;
  handle.contentEditable = "false";
  handle.setAttribute("role", "button");
  handle.setAttribute("aria-label", translate("editor.dragBlock"));
  handle.title = translate("editor.dragBlock");
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
          const handle = createHandle();
          container.appendChild(handle);
          // 持ち手を出しているブロックの位置。ドラッグを始めるときに、このブロックを選ぶ。
          let hoveredPosition: number | null = null;

          const showHandleAt = (event: MouseEvent) => {
            const block = view.editable ? topLevelBlockAt(view, event.clientY) : null;
            if (!block) {
              return;
            }
            hoveredPosition = block.position;
            const containerBox = container.getBoundingClientRect();
            const blockBox = block.element.getBoundingClientRect();
            handle.style.top = `${blockBox.top - containerBox.top}px`;
            handle.style.left = `${blockBox.left - containerBox.left - HANDLE_OFFSET_LEFT}px`;
            handle.hidden = false;
          };
          const hideHandle = (event: MouseEvent) => {
            // 本文から持ち手へ移っただけなら、出したままにする。
            if (!(event.relatedTarget instanceof Node) || !container.contains(event.relatedTarget)) {
              handle.hidden = true;
            }
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

          container.addEventListener("mousemove", showHandleAt);
          container.addEventListener("mouseleave", hideHandle);
          handle.addEventListener("dragstart", startDragging);
          return {
            destroy: () => {
              container.removeEventListener("mousemove", showHandleAt);
              container.removeEventListener("mouseleave", hideHandle);
              handle.remove();
            },
          };
        },
      }),
    ];
  },
});

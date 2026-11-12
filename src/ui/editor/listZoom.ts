// 箇条書きへのズーム。1 つの項目を選ぶと、その項目と子だけを画面に出す。上の階層は、本文の上のパンくず
// （NoteZoomBar.tsx）から戻れる。隠すのは表示だけで、本文は変えない。どの項目にズームしているかは、
// メモを開いている間だけ覚える（同期しない）。

import { type Editor, Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const LIST_ITEM_TYPES = ["listItem", "taskItem"];

// ズームしている項目の位置。していなければ null。
const zoomKey = new PluginKey<number | null>("listZoom");

function isListItem(node: ProseMirrorNode | null | undefined): node is ProseMirrorNode {
  return Boolean(node) && LIST_ITEM_TYPES.includes(node!.type.name);
}

export function zoomedItemPosition(state: EditorState): number | null {
  return zoomKey.getState(state) ?? null;
}

// position より外側にある箇条書きの項目の位置。外側のものから順に並べる。
function enclosingItemPositions(resolved: ResolvedPos): number[] {
  const positions: number[] = [];
  for (let depth = 1; depth <= resolved.depth; depth += 1) {
    if (isListItem(resolved.node(depth))) {
      positions.push(resolved.before(depth));
    }
  }
  return positions;
}

// カーソルのある箇条書きの項目（いちばん内側）の位置。項目の中でなければ null。
function itemPositionAtCursor(state: EditorState): number | null {
  const positions = enclosingItemPositions(state.selection.$from);
  return positions[positions.length - 1] ?? null;
}

export function isCursorInListItem(state: EditorState): boolean {
  return itemPositionAtCursor(state) !== null;
}

export type ZoomPathEntry = { position: number; text: string };

// ズームしている項目までの道筋（外側の項目から、ズームしている項目まで）。パンくずに出す。
export function zoomPath(state: EditorState): ZoomPathEntry[] {
  const zoomedPosition = zoomedItemPosition(state);
  if (zoomedPosition === null) {
    return [];
  }
  const positions = [...enclosingItemPositions(state.doc.resolve(zoomedPosition)), zoomedPosition];
  return positions.map((position) => ({ position, text: state.doc.nodeAt(position)?.firstChild?.textContent ?? "" }));
}

// 項目にズームする。position が null なら、ズームをやめて全体を出す。
export function zoomToItem(editor: Editor, position: number | null): boolean {
  editor.view.dispatch(editor.state.tr.setMeta(zoomKey, { zoomedPosition: position }));
  return true;
}

export function zoomIntoItemAtCursor(editor: Editor): boolean {
  const position = itemPositionAtCursor(editor.state);
  return position === null ? false : zoomToItem(editor, position);
}

// 1 つ上の階層の項目へ戻る。上に項目が無ければ、全体を出す。
export function zoomOutOneLevel(editor: Editor): boolean {
  const path = zoomPath(editor.state);
  if (path.length === 0) {
    return false;
  }
  return zoomToItem(editor, path[path.length - 2]?.position ?? null);
}

// ズームしている項目へ下りる道筋の上にないものを隠し、道筋の上の入れ物（リストと上の項目）からは、字下げと印を外す。
function zoomDecorations(doc: ProseMirrorNode, zoomedPosition: number): DecorationSet {
  const resolved = doc.resolve(zoomedPosition);
  const decorations: Decoration[] = [];
  for (let depth = 0; depth <= resolved.depth; depth += 1) {
    const container = resolved.node(depth);
    const containerStart = resolved.start(depth);
    if (depth > 0) {
      decorations.push(Decoration.node(resolved.before(depth), resolved.after(depth), { class: "zoom-path" }));
    }
    let offset = containerStart;
    container.forEach((child, _offset, index) => {
      if (index !== resolved.index(depth)) {
        decorations.push(Decoration.node(offset, offset + child.nodeSize, { class: "zoom-hidden" }));
      }
      offset += child.nodeSize;
    });
  }
  const zoomedItem = doc.nodeAt(zoomedPosition);
  if (zoomedItem) {
    decorations.push(Decoration.node(zoomedPosition, zoomedPosition + zoomedItem.nodeSize, { class: "zoomed-item" }));
  }
  return DecorationSet.create(doc, decorations);
}

export const ListZoom = Extension.create({
  name: "listZoom",
  addKeyboardShortcuts() {
    return {
      "Mod-.": ({ editor }) => zoomIntoItemAtCursor(editor),
      "Mod-Shift-.": ({ editor }) => zoomOutOneLevel(editor),
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin<number | null>({
        key: zoomKey,
        state: {
          init: () => null,
          apply: (transaction, zoomedPosition) => {
            const request = transaction.getMeta(zoomKey) as { zoomedPosition: number | null } | undefined;
            if (request) {
              return request.zoomedPosition;
            }
            if (zoomedPosition === null || !transaction.docChanged) {
              return zoomedPosition;
            }
            // 本文が変わったら、項目の今の位置へ付いていく。項目が消えたら、全体を出す。
            const mapped = transaction.mapping.mapResult(zoomedPosition, 1);
            return !mapped.deletedAfter && isListItem(transaction.doc.nodeAt(mapped.pos)) ? mapped.pos : null;
          },
        },
        props: {
          decorations: (state) => {
            const zoomedPosition = zoomedItemPosition(state);
            return zoomedPosition === null ? null : zoomDecorations(state.doc, zoomedPosition);
          },
        },
      }),
    ];
  },
});

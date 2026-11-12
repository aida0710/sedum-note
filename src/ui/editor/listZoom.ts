// 箇条書きへのズーム。1 つの項目を選ぶと、その項目と子だけを画面に出す。上の階層は、本文の上のパンくず
// （NoteZoomBar.tsx）から戻れる。隠すのは表示だけで、本文は変えない。どの項目にズームしているかは、
// メモを開いている間だけ覚える（同期しない）。
//
// ズームしている間は、見えていない所を知らないうちに書き換えないようにする。
//   全選択: ズームしている項目の中だけを選ぶ。
//   項目の題の行での Enter: 項目を 2 つに分けず（分けると、後ろと子が隠れる側へ行く）、カーソルから後ろを新しい最初の子にする。
//   カーソルがズームの外へ移ったとき（リンクや目次から送られた、など）: ズームをやめて全体を出す。

import { type Editor, Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { MessageKey } from "../i18n/translate";
import { editorKeymapName, type ShortcutKeys } from "../shared/shortcutKeys";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const LIST_ITEM_TYPES = ["listItem", "taskItem"];
// ほかの Enter と全選択の処理（項目を分ける、ID を持つブロックの上に行を足す）より先に見る。
const BEFORE_OTHER_KEYMAPS = 1100;

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
  // メニューやパンくずから来たときも、続けて打てるよう、本文にカーソルを戻す。
  editor.view.focus();
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

export const LIST_ZOOM_SHORTCUTS: Array<{ id: string; label: MessageKey; keys: ShortcutKeys; run: (editor: Editor) => boolean }> = [
  { id: "zoomIntoItem", label: "editor.zoomIntoItem", keys: { key: "z", alt: true }, run: zoomIntoItemAtCursor },
  { id: "zoomOutOneLevel", label: "editor.zoomOutOneLevel", keys: { key: "z", alt: true, shift: true }, run: zoomOutOneLevel },
];

function selectZoomedItem(editor: Editor): boolean {
  const zoomedPosition = zoomedItemPosition(editor.state);
  const zoomedItem = zoomedPosition === null ? null : editor.state.doc.nodeAt(zoomedPosition);
  if (zoomedPosition === null || !zoomedItem) {
    return false;
  }
  const { doc } = editor.state;
  const selection = TextSelection.between(doc.resolve(zoomedPosition + 1), doc.resolve(zoomedPosition + zoomedItem.nodeSize - 1));
  editor.view.dispatch(editor.state.tr.setSelection(selection));
  return true;
}

// ズームしている項目の題の行にカーソルがあるなら、カーソルから後ろの文字を、新しい最初の子の項目にする。
function splitZoomedTitleIntoFirstChild(editor: Editor): boolean {
  const { state } = editor;
  const zoomedPosition = zoomedItemPosition(state);
  const zoomedItem = zoomedPosition === null ? null : state.doc.nodeAt(zoomedPosition);
  const { $from, empty } = state.selection;
  const paragraphType = state.schema.nodes.paragraph;
  if (zoomedPosition === null || !zoomedItem || !paragraphType || !empty || !$from.parent.isTextblock || $from.before() !== zoomedPosition + 1) {
    return false;
  }
  const firstChild = zoomedItem.type.create(null, paragraphType.create(null, $from.parent.content.cut($from.parentOffset)));
  const transaction = state.tr.delete($from.pos, $from.end());
  // 題の行のすぐ後ろ。そこに子のリストがあれば先頭に入れ、無ければ、今の項目が入っているのと同じ種類のリストを作る。
  const afterTitle = $from.pos + 1;
  const hasChildList = zoomedItem.childCount > 1 && zoomedItem.child(1).type === state.doc.resolve(zoomedPosition).parent.type;
  if (hasChildList) {
    transaction.insert(afterTitle + 1, firstChild);
  } else {
    transaction.insert(afterTitle, state.doc.resolve(zoomedPosition).parent.type.create(null, firstChild));
  }
  if (zoomedItem.attrs.collapsed) {
    transaction.setNodeAttribute(zoomedPosition, "collapsed", false);
  }
  editor.view.dispatch(transaction.setSelection(TextSelection.near(transaction.doc.resolve(afterTitle + 1))).scrollIntoView());
  return true;
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
  priority: BEFORE_OTHER_KEYMAPS,
  addKeyboardShortcuts() {
    return {
      ...Object.fromEntries(LIST_ZOOM_SHORTCUTS.map((shortcut) => [editorKeymapName(shortcut.keys), () => shortcut.run(this.editor as Editor)])),
      "Mod-a": ({ editor }) => selectZoomedItem(editor as Editor),
      Enter: ({ editor }) => splitZoomedTitleIntoFirstChild(editor as Editor),
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
            if (zoomedPosition === null) {
              return null;
            }
            // 本文が変わったら、項目の今の位置へ付いていく。項目が消えたら、全体を出す。
            const mapped = transaction.mapping.mapResult(zoomedPosition, 1);
            const zoomedItem = mapped.deletedAfter ? null : transaction.doc.nodeAt(mapped.pos);
            if (!isListItem(zoomedItem)) {
              return null;
            }
            // カーソルがズームの外へ移ったら（リンク・目次・検索から送られた）、行き先が見えるよう、全体を出す。
            const { from, to } = transaction.selection;
            const selectionIsInside = from > mapped.pos && to < mapped.pos + zoomedItem.nodeSize;
            return transaction.selectionSet && !selectionIsInside ? null : mapped.pos;
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

// ズーム。箇条書きの項目か見出しのセクションを選ぶと、そこだけを画面に出す（アウトライナーと同じ）。
//   箇条書きの項目: その項目と子。行頭の印（・や番号）を押すとズームする。
//   見出しのセクション: その見出しから、次の同じ段か上の段の見出しの手前まで。見出しの左のボタンを押すとズームする。
// ズームしている間は、その部分だけを画面いっぱいに出し、左上の戻るボタン（ZoomBackButton.tsx）で 1 つ上の階層へ戻る。
// 隠すのは表示だけで、本文は変えない。
// どこにズームしているかは、メモを開いている間だけ覚える（同期しない）。
//
// ズームしている間は、見えていない所を知らないうちに書き換えないようにする。
//   全選択: ズームしている所の中だけを選ぶ。
//   項目の題の行での Enter: 項目を 2 つに分けず（分けると、後ろと子が隠れる側へ行く）、カーソルから後ろを新しい最初の子にする。
//   ズームしている項目の直下の子での Shift+Tab、その先頭の Backspace、空の子での Enter: 何もしない（どれも子を 1 段浅くする操作で、
//          子がズームの外へ出る）。
//   カーソルがズームの外へ移ったとき（リンクや目次から送られた、など）: ズームをやめて全体を出す。

import { type Editor, Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { translate } from "../i18n/translate";
import { editorShortcutPlugin } from "./editorShortcutPlugin";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

const LIST_ITEM_TYPES = ["listItem", "taskItem"];
const HEADING_TYPE = "heading";
// ほかの Enter と全選択の処理（項目を分ける、ID を持つブロックの上に行を足す）より先に見る。
const BEFORE_OTHER_KEYMAPS = 1100;

// ズームしている項目か見出しの位置。していなければ null。
const zoomKey = new PluginKey<number | null>("zoom");

// 本文のある位置を見せたい変更（メモの中の検索で当たりへ移る、など）に付ける印。値はその位置。
// カーソルを動かさずに見せる変更でも、その位置がズームの外なら、ズームをやめて全体を出す。
export const REVEAL_POSITION_META = "revealPosition";

function isListItem(node: ProseMirrorNode | null | undefined): node is ProseMirrorNode {
  return Boolean(node) && LIST_ITEM_TYPES.includes(node!.type.name);
}

// 見出しか（項目か見出しかを分けるので、型の絞り込みはしない。どちらも同じ ProseMirrorNode の型のため）。
function isHeading(node: ProseMirrorNode | null | undefined): boolean {
  return node?.type.name === HEADING_TYPE;
}

// 見出しのセクションの、最後のブロックの位置（親の中の何番目か）。次の同じ段か上の段の見出しの手前まで。
function lastSectionIndex(parent: ProseMirrorNode, headingIndex: number): number {
  const level = parent.child(headingIndex).attrs.level as number;
  for (let index = headingIndex + 1; index < parent.childCount; index += 1) {
    const sibling = parent.child(index);
    if (isHeading(sibling) && (sibling.attrs.level as number) <= level) {
      return index - 1;
    }
  }
  return parent.childCount - 1;
}

// ズームして見せる範囲（本文の位置）。項目ならその項目、見出しならセクション全体。
function zoomedRange(doc: ProseMirrorNode, position: number): { from: number; to: number } | null {
  const node = doc.nodeAt(position);
  if (isListItem(node)) {
    return { from: position, to: position + node.nodeSize };
  }
  if (!node || !isHeading(node)) {
    return null;
  }
  const resolved = doc.resolve(position);
  const parent = resolved.parent;
  let to = position;
  for (let index = resolved.index(); index <= lastSectionIndex(parent, resolved.index()); index += 1) {
    to += parent.child(index).nodeSize;
  }
  return { from: position, to };
}

export function zoomedItemPosition(state: EditorState): number | null {
  return zoomKey.getState(state) ?? null;
}

// 本文の範囲（from〜to）が、ズームして見せている所の中にあるか。ズームしている項目や見出しそのものは中に入れない。
// ズームしていなければ、いつも true。
export function isInsideZoom(state: EditorState, from: number, to: number): boolean {
  const zoomedPosition = zoomedItemPosition(state);
  const range = zoomedPosition === null ? null : zoomedRange(state.doc, zoomedPosition);
  return range === null || (from > range.from && to <= range.to);
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

export type ZoomTarget = "item" | "section";

// カーソルの所でズームできるもの。箇条書きの項目の中ならその項目（いちばん内側）、見出しの中ならそのセクション。
function zoomTargetPositionAtCursor(state: EditorState): number | null {
  const { $from } = state.selection;
  const positions = enclosingItemPositions($from);
  const itemPosition = positions[positions.length - 1];
  if (itemPosition !== undefined) {
    return itemPosition;
  }
  return isHeading($from.parent) ? $from.before() : null;
}

export function zoomTargetAtCursor(state: EditorState): ZoomTarget | null {
  const position = zoomTargetPositionAtCursor(state);
  return position === null ? null : isHeading(state.doc.nodeAt(position)) ? "section" : "item";
}

export type ZoomPathEntry = { position: number; text: string };

// 見出しの上の段の見出しの位置（外側のものから順）。同じ入れ物の中で、前にある段の小さい見出しをたどる。
function enclosingHeadingPositions(doc: ProseMirrorNode, headingPosition: number): number[] {
  const resolved = doc.resolve(headingPosition);
  const parent = resolved.parent;
  const positions: number[] = [];
  let level = parent.child(resolved.index()).attrs.level as number;
  let position = headingPosition;
  for (let index = resolved.index() - 1; index >= 0 && level > 1; index -= 1) {
    const sibling = parent.child(index);
    position -= sibling.nodeSize;
    if (isHeading(sibling) && (sibling.attrs.level as number) < level) {
      positions.unshift(position);
      level = sibling.attrs.level as number;
    }
  }
  return positions;
}

// 戻るボタンに出す名前。見出しはその文字、項目は最初の段落の文字。
function entryText(node: ProseMirrorNode | null): string {
  if (!node) {
    return "";
  }
  return isHeading(node) ? node.textContent : node.firstChild?.textContent ?? "";
}

// ズームしている所までの道筋（外側の項目や上の段の見出しから、ズームしている所まで）。戻るボタンが、1 つ上の名前と行き先に使う。
export function zoomPath(state: EditorState): ZoomPathEntry[] {
  const zoomedPosition = zoomedItemPosition(state);
  if (zoomedPosition === null) {
    return [];
  }
  const { doc } = state;
  const outer = isHeading(doc.nodeAt(zoomedPosition)) ? enclosingHeadingPositions(doc, zoomedPosition) : enclosingItemPositions(doc.resolve(zoomedPosition));
  return [...outer, zoomedPosition].map((position) => ({ position, text: entryText(doc.nodeAt(position)) }));
}

// 項目にズームする。position が null なら、ズームをやめて全体を出す。
export function zoomToItem(editor: Editor, position: number | null): boolean {
  editor.view.dispatch(editor.state.tr.setMeta(zoomKey, { zoomedPosition: position }));
  // メニューや戻るボタンから来たときも、続けて打てるよう、本文にカーソルを戻す。
  editor.view.focus();
  return true;
}

export function zoomIntoCursor(editor: Editor): boolean {
  const position = zoomTargetPositionAtCursor(editor.state);
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

function selectZoomedItem(editor: Editor): boolean {
  const zoomedPosition = zoomedItemPosition(editor.state);
  const { doc } = editor.state;
  const range = zoomedPosition === null ? null : zoomedRange(doc, zoomedPosition);
  if (!range) {
    return false;
  }
  const selection = TextSelection.between(doc.resolve(range.from + 1), doc.resolve(range.to - 1));
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

// カーソルのある項目（いちばん内側）が、ズームしている項目の直下の子か。その項目を 1 段浅くすると、ズームの外へ出る。
function isCursorInDirectChildOfZoomedItem(state: EditorState): boolean {
  const zoomedPosition = zoomedItemPosition(state);
  const positions = enclosingItemPositions(state.selection.$from);
  return zoomedPosition !== null && positions.length >= 2 && positions[positions.length - 2] === zoomedPosition;
}

// 項目の題の行の先頭にカーソル（選択なし）があるか。ここでの Backspace は、項目を 1 段浅くする。
function isCursorAtItemStart(state: EditorState): boolean {
  const { $from, empty } = state.selection;
  return empty && $from.parentOffset === 0 && $from.depth >= 2 && isListItem($from.node(-1)) && $from.index(-1) === 0;
}

// カーソルが、中身の無い項目（空の題の行だけ）にあるか。ここでの Enter は、項目を 1 段浅くする。
function isCursorInEmptyItem(state: EditorState): boolean {
  const { $from, empty } = state.selection;
  return empty && $from.depth >= 2 && isListItem($from.node(-1)) && $from.node(-1).childCount === 1 && $from.parent.content.size === 0;
}

// ズームしている所へ下りる道筋の上にないものを隠し、道筋の上の入れ物（リストと上の項目）からは、字下げと印を外す。
// 見出しのセクションでは、見出しと同じ入れ物の中の、セクションの外のブロックを隠す。
function zoomDecorations(doc: ProseMirrorNode, zoomedPosition: number): DecorationSet {
  const resolved = doc.resolve(zoomedPosition);
  const zoomedNode = doc.nodeAt(zoomedPosition);
  const decorations: Decoration[] = [];
  for (let depth = 0; depth <= resolved.depth; depth += 1) {
    const container = resolved.node(depth);
    const containerStart = resolved.start(depth);
    if (depth > 0) {
      decorations.push(Decoration.node(resolved.before(depth), resolved.after(depth), { class: "zoom-path" }));
    }
    const shownFrom = resolved.index(depth);
    const shownTo = depth === resolved.depth && isHeading(zoomedNode) ? lastSectionIndex(container, shownFrom) : shownFrom;
    let offset = containerStart;
    container.forEach((child, _offset, index) => {
      if (index < shownFrom || index > shownTo) {
        decorations.push(Decoration.node(offset, offset + child.nodeSize, { class: "zoom-hidden" }));
      }
      offset += child.nodeSize;
    });
  }
  if (isListItem(zoomedNode)) {
    decorations.push(Decoration.node(zoomedPosition, zoomedPosition + zoomedNode.nodeSize, { class: "zoomed-item" }));
  }
  return DecorationSet.create(doc, decorations);
}

// 見出しの左（折りたたみの印のさらに左）に出す、そのセクションにズームするボタン。ポインターを乗せたときに出す（CSS）。
const ZOOM_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>';

function sectionZoomButton(view: EditorView, headingPosition: number): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "section-zoom";
  button.contentEditable = "false";
  button.setAttribute("aria-label", translate("editor.zoomIntoSection"));
  button.title = translate("editor.zoomIntoSection");
  button.innerHTML = ZOOM_ICON_SVG;
  // 押しても、エディタの選択を動かさない。
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    view.dispatch(view.state.tr.setMeta(zoomKey, { zoomedPosition: headingPosition }));
    view.focus();
  });
  return button;
}

// ボタンは本文の直下の見出しにだけ出す。段組み・コールアウト・引用・表の中の見出しで左に出すと、隣の段の文字や
// 枠に重なるため（中の見出しには、メモの「…」と Ctrl+. でズームできる）。
function sectionZoomButtons(doc: ProseMirrorNode, zoomedPosition: number | null): Decoration[] {
  const decorations: Decoration[] = [];
  doc.forEach((node, position) => {
    // ズームしているセクションの見出しには出さない（もうそこにいるので）。
    if (isHeading(node) && position !== zoomedPosition) {
      decorations.push(Decoration.widget(position + 1, (view) => sectionZoomButton(view, position), { side: -1, key: `section-zoom-${position}`, ignoreSelection: true }));
    }
  });
  return decorations;
}

// 箇条書きの行頭の印（・や番号）を押したら、その項目。印はリストの左の余白に描かれ、押すとリストか項目の要素が受ける。
// チェックリストは、印の所にチェックボックスがあるので除く。
function listItemAtMarker(view: EditorView, event: MouseEvent): number | null {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const list = target.tagName === "LI" ? target.parentElement : target;
  if (!list || !["UL", "OL"].includes(list.tagName) || list.dataset.type === "taskList") {
    return null;
  }
  const item = [...list.children].find((child) => {
    const box = child.getBoundingClientRect();
    const firstLine = (child.firstElementChild ?? child).getBoundingClientRect();
    return child.tagName === "LI" && event.clientX < box.left && event.clientY >= firstLine.top && event.clientY <= firstLine.bottom;
  });
  if (!item) {
    return null;
  }
  const position = view.posAtDOM(item, 0) - 1;
  return isListItem(view.state.doc.nodeAt(position)) ? position : null;
}

export const Zoom = Extension.create({
  name: "zoom",
  priority: BEFORE_OTHER_KEYMAPS,
  addKeyboardShortcuts() {
    return {
      "Mod-a": ({ editor }) => selectZoomedItem(editor as Editor),
      Enter: ({ editor }) => splitZoomedTitleIntoFirstChild(editor as Editor) || (isCursorInDirectChildOfZoomedItem(editor.state) && isCursorInEmptyItem(editor.state)),
      "Shift-Tab": ({ editor }) => isCursorInDirectChildOfZoomedItem(editor.state),
      Backspace: ({ editor }) => isCursorInDirectChildOfZoomedItem(editor.state) && isCursorAtItemStart(editor.state),
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor as Editor;
    return [
      // カーソルの項目にズーム（既定は Logseq と同じ Ctrl+.、Mac は ⌘+.）と、1 つ上へ戻る（既定は Ctrl+Shift+.。Esc でも戻る。
      // zoomOutOnEscape.ts）。キーは設定で変えられ、メモの「…」の「この項目にズーム」にも出す。
      editorShortcutPlugin({ zoomIntoCursor: () => zoomIntoCursor(editor), zoomOutOneLevel: () => zoomOutOneLevel(editor) }),
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
            // 本文が変わったら、項目か見出しの今の位置へ付いていく。消えたら、全体を出す。
            const mapped = transaction.mapping.mapResult(zoomedPosition, 1);
            const range = mapped.deletedAfter ? null : zoomedRange(transaction.doc, mapped.pos);
            if (!range) {
              return null;
            }
            // カーソルがズームの外へ移ったら（リンク・目次から送られた）か、ズームの外の位置を見せる変更なら（検索の当たり）、
            // 行き先が見えるよう、全体を出す。
            const isInside = (from: number, to: number) => from > range.from && to < range.to;
            const { from, to } = transaction.selection;
            const revealedPosition = transaction.getMeta(REVEAL_POSITION_META) as number | undefined;
            const leavesZoom = (transaction.selectionSet && !isInside(from, to)) || (revealedPosition !== undefined && !isInside(revealedPosition, revealedPosition));
            return leavesZoom ? null : mapped.pos;
          },
        },
        props: {
          decorations: (state) => {
            const zoomedPosition = zoomedItemPosition(state);
            const buttons = sectionZoomButtons(state.doc, zoomedPosition);
            return zoomedPosition === null ? DecorationSet.create(state.doc, buttons) : zoomDecorations(state.doc, zoomedPosition).add(state.doc, buttons);
          },
          handleDOMEvents: {
            mousedown: (view, event) => {
              const position = listItemAtMarker(view, event);
              if (position === null) {
                return false;
              }
              event.preventDefault();
              view.dispatch(view.state.tr.setMeta(zoomKey, { zoomedPosition: position }));
              view.focus();
              return true;
            },
          },
        },
      }),
    ];
  },
});

// ボタンの下に開くメニュー。外を押すか Escape で閉じる。
// 開くとフォーカスがメニューへ移り、↑↓・Home・End で項目を選べる。閉じると、開いたボタンへフォーカスを戻す。

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { returnFocusTo } from "./focusReturn";
import { isImeKeyEvent } from "./imeKeyEvent";

type PopupMenuProps = {
  anchor: HTMLElement;
  onClose: () => void;
  children: ReactNode;
  // メニューの右端をボタンの右端にそろえる（end、既定）か、左端をボタンの左端にそろえる（start）か。
  // 画面の左の端にあるボタン（本文の左の持ち手など）では start にして、メニューを右へ開く。
  align?: "start" | "end";
  // 本文の選択を保ったまま開くメニュー（文字を選んだときのボタンから開くものなど）は false にする。
  // フォーカスを本文から動かすと、選択に付いているボタンの並びごと消えるため。このときは ↑↓ での操作も受けない。
  takesFocus?: boolean;
};

// 画面の端からこれだけ離して置く。
const VIEWPORT_MARGIN = 8;
// ボタンとメニューの間。
const ANCHOR_GAP = 4;

const MENU_ITEM_SELECTOR = "button:not(:disabled), a[href], input:not(:disabled)";

// メニューの要素から、それを開いたボタンを引く。メニューの項目から開いたダイアログが、閉じたときにフォーカスを戻す先に使う
// （項目そのものは、メニューと一緒に消えている）。
const anchorsByMenu = new WeakMap<Element, HTMLElement>();

export function menuAnchorOf(element: Element | null): HTMLElement | null {
  const menu = element?.closest('[role="menu"]');
  return (menu && anchorsByMenu.get(menu)) ?? null;
}

type MenuPlacement = { top: number; left: number; maxHeight: number };

// ボタンの下に入ればその下、入らなければ上と下の広い方に置き、高さをその空きまでに抑える（残りはメニューの中で送る）。
function placeMenu(anchorBox: DOMRect, menuSize: { width: number; height: number }, align: "start" | "end"): MenuPlacement {
  const preferredLeft = align === "start" ? anchorBox.left : anchorBox.right - menuSize.width;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, window.innerWidth - menuSize.width - VIEWPORT_MARGIN));
  const spaceBelow = window.innerHeight - VIEWPORT_MARGIN - (anchorBox.bottom + ANCHOR_GAP);
  const spaceAbove = anchorBox.top - ANCHOR_GAP - VIEWPORT_MARGIN;
  if (menuSize.height <= spaceBelow || spaceBelow >= spaceAbove) {
    return { top: anchorBox.bottom + ANCHOR_GAP, left, maxHeight: Math.max(spaceBelow, 0) };
  }
  const height = Math.min(menuSize.height, spaceAbove);
  return { top: anchorBox.top - ANCHOR_GAP - height, left, maxHeight: Math.max(spaceAbove, 0) };
}

export function PopupMenu({ anchor, onClose, children, align = "end", takesFocus = true }: PopupMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const isPlaced = placement !== null;

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) {
      return;
    }
    // 高さの上限を外した、中身どおりの大きさで測る。
    menu.style.maxHeight = "none";
    const menuBox = menu.getBoundingClientRect();
    menu.style.maxHeight = "";
    setPlacement(placeMenu(anchor.getBoundingClientRect(), menuBox, align));
  }, [anchor, align]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) {
      return;
    }
    anchorsByMenu.set(menu, anchor);
    // 置く場所が決まるまでは見えない（visibility: hidden）ので、フォーカスを受けられない。決まってから移す。
    if (!takesFocus || !isPlaced) {
      return;
    }
    menu.focus({ preventScroll: true });
    return () => {
      // 項目を押して閉じたときは、フォーカスが消えた項目に残る。開いたボタンへ戻す。
      // ほかの場所（外を押した先、項目が開いたダイアログ）へ移っていれば、そのままにする。
      const focused = document.activeElement;
      if ((focused === null || focused === document.body || menu.contains(focused)) && anchor.isConnected) {
        returnFocusTo(anchor);
      }
    };
  }, [anchor, takesFocus, isPlaced]);

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (isImeKeyEvent(event)) {
        return;
      }
      if (event.key === "Escape") {
        onClose();
        return;
      }
      const menu = menuRef.current;
      if (!takesFocus || !menu || !menu.contains(document.activeElement)) {
        return;
      }
      if (event.key === "Tab") {
        // メニューは画面の並びの外にあるので、Tab で次へ進むと行き先が飛ぶ。閉じて、開いたボタンへ戻す。
        event.preventDefault();
        onClose();
        return;
      }
      // 入力欄の中の Home・End は、欄の中のカーソルの移動に使う。
      if (document.activeElement instanceof HTMLInputElement && (event.key === "Home" || event.key === "End")) {
        return;
      }
      const target = itemToFocus(menu, event.key);
      if (target) {
        event.preventDefault();
        target.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [anchor, onClose, takesFocus]);

  return (
    <div ref={menuRef} className="menu" role="menu" tabIndex={-1}
      style={placement ?? { top: 0, left: 0, visibility: "hidden" }}>
      {children}
    </div>
  );
}

// ↑↓・Home・End で次にフォーカスする項目。それ以外のキーなら null。
function itemToFocus(menu: HTMLElement, key: string): HTMLElement | null {
  const items = [...menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)];
  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  switch (key) {
    case "ArrowDown":
      return items[(currentIndex + 1) % items.length] ?? null;
    case "ArrowUp":
      return items[currentIndex <= 0 ? items.length - 1 : currentIndex - 1] ?? null;
    case "Home":
      return items[0] ?? null;
    case "End":
      return items[items.length - 1] ?? null;
    default:
      return null;
  }
}

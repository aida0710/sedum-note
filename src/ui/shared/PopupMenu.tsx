// ボタンの下に開くメニュー。外を押すか Escape で閉じる。
// 開くとフォーカスがメニューへ移り、↑↓・Home・End と、項目の名前の頭の文字で項目を選べる。閉じると、開いたボタンへフォーカスを戻す。
// 本文の選択を保つメニュー（takesFocus が false）は、フォーカスを本文に残したまま ↑↓ と Enter を受け、選んでいる項目を
// aria-activedescendant で示す。
// 開いたボタン（aria-haspopup を持つもの）には、開いている間 aria-expanded="true" を付ける。

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { foldForSearch } from "../../core/notes/searchTextFolding";
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
// 本文の選択を保つメニューで、キーで選んでいる項目に付けるクラス。
const ACTIVE_DESCENDANT_CLASS = "active-descendant";

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
  const menuId = useId();
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const isPlaced = placement !== null;

  // 開いているかを、開いたボタンの aria-expanded で読み上げに伝える。右クリックで開いた行など、メニューのボタンでないものには付けない。
  useEffect(() => {
    if (!anchor.hasAttribute("aria-haspopup")) {
      return;
    }
    anchor.setAttribute("aria-expanded", "true");
    return () => anchor.setAttribute("aria-expanded", "false");
  }, [anchor]);

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
      if (event.ctrlKey || event.metaKey || event.altKey) {
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
      const items = menuItemsIn(menu);
      const target = itemToMoveTo({ items, current: items.indexOf(document.activeElement as HTMLElement), key: event.key })
        ?? (document.activeElement instanceof HTMLInputElement ? null : itemStartingWith(items, event.key));
      if (target) {
        event.preventDefault();
        target.focus();
      }
    };
    // 本文の選択を保つメニュー: フォーカスは本文にあるので、本文より先に（捕まえる段階で）キーを受ける。
    const moveActiveDescendant = (event: KeyboardEvent) => {
      const menu = menuRef.current;
      if (takesFocus || !menu || isImeKeyEvent(event) || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const items = menuItemsIn(menu);
      const active = items.find((item) => item.classList.contains(ACTIVE_DESCENDANT_CLASS)) ?? null;
      if (event.key === "Enter" && active) {
        event.preventDefault();
        event.stopPropagation();
        active.click();
        return;
      }
      const target = itemToMoveTo({ items, current: active ? items.indexOf(active) : -1, key: event.key });
      if (!target) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      showActiveDescendant({ menu, target, menuId });
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", handleKey);
    document.addEventListener("keydown", moveActiveDescendant, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("keydown", moveActiveDescendant, true);
    };
  }, [anchor, onClose, takesFocus, menuId]);

  // 閉じたら、本文に付けた aria-activedescendant を外す。
  useEffect(() => () => {
    const focused = document.activeElement;
    if (focused?.getAttribute("aria-activedescendant")?.startsWith(menuId)) {
      focused.removeAttribute("aria-activedescendant");
    }
  }, [menuId]);

  return (
    <div ref={menuRef} id={menuId} className="menu" role="menu" tabIndex={-1}
      style={placement ?? { top: 0, left: 0, visibility: "hidden" }}>
      {children}
    </div>
  );
}

function menuItemsIn(menu: HTMLElement): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)];
}

// ↑↓・Home・End で次に選ぶ項目。current は今の項目の位置（無ければ -1）。それ以外のキーなら null。
function itemToMoveTo({ items, current, key }: { items: HTMLElement[]; current: number; key: string }): HTMLElement | null {
  switch (key) {
    case "ArrowDown":
      return items[(current + 1) % items.length] ?? null;
    case "ArrowUp":
      return items[current <= 0 ? items.length - 1 : current - 1] ?? null;
    case "Home":
      return items[0] ?? null;
    case "End":
      return items[items.length - 1] ?? null;
    default:
      return null;
  }
}

// 打った 1 文字で名前が始まる項目（今の項目の次から探し、最後まで行ったら先頭に戻る）。全角と半角、大文字と小文字は区別しない。
function itemStartingWith(items: HTMLElement[], key: string): HTMLElement | null {
  if ([...key].length !== 1 || key.trim() === "") {
    return null;
  }
  const typed = foldForSearch(key);
  const current = items.indexOf(document.activeElement as HTMLElement);
  for (let offset = 1; offset <= items.length; offset += 1) {
    const item = items[(current + offset) % items.length];
    const name = item?.getAttribute("aria-label") ?? item?.textContent ?? "";
    if (item && foldForSearch(name.trim()).startsWith(typed)) {
      return item;
    }
  }
  return null;
}

// 本文の選択を保つメニューで、キーで選んだ項目を見せ、フォーカスのある本文から aria-activedescendant で指す。
function showActiveDescendant({ menu, target, menuId }: { menu: HTMLElement; target: HTMLElement; menuId: string }): void {
  for (const item of menuItemsIn(menu)) {
    item.classList.remove(ACTIVE_DESCENDANT_CLASS);
  }
  target.classList.add(ACTIVE_DESCENDANT_CLASS);
  target.id ||= `${menuId}-item-${menuItemsIn(menu).indexOf(target)}`;
  target.scrollIntoView({ block: "nearest" });
  document.activeElement?.setAttribute("aria-activedescendant", target.id);
}

// ボタンの下に開くメニュー。外を押すか Escape で閉じる。

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isImeKeyEvent } from "./imeKeyEvent";

type PopupMenuProps = {
  anchor: HTMLElement;
  onClose: () => void;
  children: ReactNode;
  // メニューの右端をボタンの右端にそろえる（end、既定）か、左端をボタンの左端にそろえる（start）か。
  // 画面の左の端にあるボタン（本文の左の持ち手など）では start にして、メニューを右へ開く。
  align?: "start" | "end";
};

// 画面の端からこれだけ離して置く。
const VIEWPORT_MARGIN = 8;

export function PopupMenu({ anchor, onClose, children, align = "end" }: PopupMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const anchorBox = anchor.getBoundingClientRect();
    const menuBox = menuRef.current?.getBoundingClientRect();
    const width = menuBox?.width ?? 200;
    const height = menuBox?.height ?? 0;
    const preferredLeft = align === "start" ? anchorBox.left : anchorBox.right - width;
    const left = Math.min(Math.max(VIEWPORT_MARGIN, preferredLeft), window.innerWidth - width - VIEWPORT_MARGIN);
    const below = anchorBox.bottom + 4;
    const top = below + height > window.innerHeight - VIEWPORT_MARGIN ? Math.max(VIEWPORT_MARGIN, anchorBox.top - height - 4) : below;
    setPosition({ top, left });
  }, [anchor, align]);

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) {
        onClose();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isImeKeyEvent(event)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [anchor, onClose]);

  return (
    <div ref={menuRef} className="menu" role="menu" style={position}>
      {children}
    </div>
  );
}

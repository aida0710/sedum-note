// ボタンの下に開くメニュー。外を押すか Escape で閉じる。

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isImeKeyEvent } from "./imeKeyEvent";

type PopupMenuProps = {
  anchor: HTMLElement;
  onClose: () => void;
  children: ReactNode;
};

// 画面の端からこれだけ離して置く。
const VIEWPORT_MARGIN = 8;

export function PopupMenu({ anchor, onClose, children }: PopupMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const anchorBox = anchor.getBoundingClientRect();
    const menuBox = menuRef.current?.getBoundingClientRect();
    const width = menuBox?.width ?? 200;
    const height = menuBox?.height ?? 0;
    const left = Math.min(Math.max(VIEWPORT_MARGIN, anchorBox.right - width), window.innerWidth - width - VIEWPORT_MARGIN);
    const below = anchorBox.bottom + 4;
    const top = below + height > window.innerHeight - VIEWPORT_MARGIN ? Math.max(VIEWPORT_MARGIN, anchorBox.top - height - 4) : below;
    setPosition({ top, left });
  }, [anchor]);

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

// 画面の上に重ねるダイアログの枠。背景を押すか Escape で閉じる。中身は呼び出し側が入れる。

import type { ReactNode } from "react";
import { isImeKeyEvent } from "./imeKeyEvent";

type ModalDialogProps = {
  // 読み上げ用の名前。
  label: string;
  // 大きさなどを変えるための、追加のクラス。
  className?: string;
  onClose: () => void;
  children: ReactNode;
};

export function ModalDialog({ label, className = "", onClose, children }: ModalDialogProps) {
  return (
    <div className="dialog-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`dialog ${className}`.trim()} role="dialog" aria-modal="true" aria-label={label}
        onKeyDown={(event) => event.key === "Escape" && !isImeKeyEvent(event.nativeEvent) && onClose()}>
        {children}
      </div>
    </div>
  );
}

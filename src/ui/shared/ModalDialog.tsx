// 画面の上に重ねるダイアログの枠。背景を押すか Escape で閉じる。中身は呼び出し側が入れる。
// 見出し（title）と説明（description）を渡すと、どのダイアログでも同じ形で上に出す。

import { type ReactNode, useEffect, useRef } from "react";
import { returnFocusTo } from "./focusReturn";
import { isImeKeyEvent } from "./imeKeyEvent";

type ModalDialogProps = {
  // 読み上げ用の名前。
  label: string;
  title?: string;
  description?: string;
  // 大きさなどを変えるための、追加のクラス。
  className?: string;
  onClose: () => void;
  children: ReactNode;
};

export function ModalDialog({ label, title, description, className = "", onClose, children }: ModalDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // 開く前にフォーカスがあった要素（開いたボタンなど）。閉じたらそこへ戻す。
  const openerRef = useRef<Element | null>(document.activeElement);
  useEffect(() => {
    // 中の入力欄が autoFocus でフォーカスを取っていなければ、枠にフォーカスを移す。
    // 移さないと、メニューから開いたときに Escape が枠に届かず、閉じられない。
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      dialog.focus();
    }
    const opener = openerRef.current;
    return () => {
      // 開発時の StrictMode は、閉じていないのに後始末を 1 度走らせる。そのときはダイアログが画面に残っているので、
      // フォーカスを戻さない（戻すと、入力欄の autoFocus が外れ、開いた直後に打った文字が後ろの本文に入る）。
      if (dialog?.isConnected) {
        return;
      }
      if (opener instanceof HTMLElement && opener.isConnected) {
        returnFocusTo(opener);
      }
    };
  }, []);
  return (
    <div className="dialog-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} className={`dialog ${className}`.trim()} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        onKeyDown={(event) => event.key === "Escape" && !isImeKeyEvent(event.nativeEvent) && onClose()}>
        {title && <h2 className="dialog-title">{title}</h2>}
        {description && <p className="dialog-description">{description}</p>}
        {children}
      </div>
    </div>
  );
}

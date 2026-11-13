// 画面の上に重ねるダイアログの枠。背景を押すか Escape で閉じる。中身は呼び出し側が入れる。
// 開いている間、Tab はダイアログの中だけを回る（外へ出ると、Escape が届かず閉じられなくなる）。
// 見出し（title）と説明（description）を渡すと、どのダイアログでも同じ形で上に出す。

import { type ReactNode, useEffect, useRef } from "react";
import { returnFocusTo } from "./focusReturn";
import { isImeKeyEvent } from "./imeKeyEvent";
import { menuAnchorOf } from "./PopupMenu";

const FOCUSABLE_SELECTOR = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

// Tab をダイアログの端で折り返す。端でなければ、ブラウザの並びのまま進ませる。
function keepTabInside(dialog: HTMLElement, event: { shiftKey: boolean; preventDefault: () => void }): void {
  const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((element) => element.offsetParent !== null);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  const focused = document.activeElement;
  if (event.shiftKey && (focused === first || focused === dialog)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && focused === last) {
    event.preventDefault();
    first.focus();
  }
}

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
  // メニューの項目から開いたときは、項目がメニューごと消えるので、メニューを開いたボタンへ戻す。
  const openerRef = useRef<Element | null>(menuAnchorOf(document.activeElement) ?? document.activeElement);
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
        onKeyDown={(event) => {
          if (isImeKeyEvent(event.nativeEvent)) {
            return;
          }
          if (event.key === "Escape") {
            onClose();
          } else if (event.key === "Tab") {
            keepTabInside(event.currentTarget, event);
          }
        }}>
        {title && <h2 className="dialog-title">{title}</h2>}
        {description && <p className="dialog-description">{description}</p>}
        {children}
      </div>
    </div>
  );
}

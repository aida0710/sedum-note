// 画面の下に短く出す知らせ。操作を取り消すボタンを付けられる（ゴミ箱に入れた直後の「元に戻す」など）。

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

// 知らせを出しておく時間。読んで、取り消すボタンを押すのに足りる長さ。
const TOAST_DURATION_MILLISECONDS = 6_000;

export type Toast = { message: string; action?: { label: string; run: () => void } };

const ToastContext = createContext<(toast: Toast) => void>(() => undefined);

export function useToast(): (toast: Toast) => void {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  // 新しい知らせは、前の知らせを置き換える。
  const [shown, setShown] = useState<{ toast: Toast; sequence: number } | null>(null);
  const show = useCallback((toast: Toast) => setShown((previous) => ({ toast, sequence: (previous?.sequence ?? 0) + 1 })), []);
  useEffect(() => {
    if (shown === null) {
      return;
    }
    const timer = setTimeout(() => setShown(null), TOAST_DURATION_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [shown]);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {shown && (
        <div className="toast" role="status">
          {shown.toast.message}
          {shown.toast.action && (
            <button type="button" onClick={() => { shown.toast.action?.run(); setShown(null); }}>{shown.toast.action.label}</button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

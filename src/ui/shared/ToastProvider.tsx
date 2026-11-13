// 画面の下に短く出す知らせ。操作を取り消すボタンを付けられる（ゴミ箱に入れた直後の「元に戻す」など）。

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

// 知らせを出しておく時間。読んで、取り消すボタンを押すのに足りる長さ。
const TOAST_DURATION_MILLISECONDS = 6_000;

export type Toast = {
  message: string;
  action?: { label: string; run: () => void };
  // 知らせが消えたとき（時間切れ、次の知らせに置き換わった、ボタンを押した）に呼ぶ。
  onDismiss?: () => void;
};

const ToastContext = createContext<(toast: Toast) => void>(() => undefined);

export function useToast(): (toast: Toast) => void {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  // 新しい知らせは、前の知らせを置き換える。
  const [shown, setShown] = useState<{ toast: Toast; sequence: number } | null>(null);
  const shownRef = useRef<Toast | null>(null);
  // ポインターを乗せている間・ボタンにフォーカスがある間は消さない（「元に戻す」を押そうとした瞬間に消えないように）。
  const [isHeld, setIsHeld] = useState(false);
  const replaceShown = useCallback((toast: Toast | null) => {
    const previous = shownRef.current;
    shownRef.current = toast;
    previous?.onDismiss?.();
    setShown((current) => (toast ? { toast, sequence: (current?.sequence ?? 0) + 1 } : null));
    if (!toast) {
      setIsHeld(false);
    }
  }, []);
  useEffect(() => {
    if (shown === null || isHeld) {
      return;
    }
    const timer = setTimeout(() => replaceShown(null), TOAST_DURATION_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [shown, isHeld, replaceShown]);
  return (
    <ToastContext.Provider value={replaceShown}>
      {children}
      {shown && (
        <div className="toast" role="status"
          onPointerEnter={() => setIsHeld(true)} onPointerLeave={() => setIsHeld(false)}
          onFocus={() => setIsHeld(true)} onBlur={() => setIsHeld(false)}>
          <span className="toast-message">{shown.toast.message}</span>
          {shown.toast.action && (
            <button type="button" onClick={() => { shown.toast.action?.run(); replaceShown(null); }}>{shown.toast.action.label}</button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

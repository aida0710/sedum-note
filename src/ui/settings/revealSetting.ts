// コマンドパレットで選んだ設定の項目を、開いた設定のページの中で探して見せる。
// 項目の名前と同じ文字の見出しか入力欄の名前を探し、そこまでスクロールして、入力欄があればカーソルを置き、少しの間光らせる。

import { type RefObject, useEffect } from "react";

// 見せる項目の合図。serial が変わるたびに探す。
export type SettingRevealRequest = { serial: number; label: string };

// 最後に見せた合図。設定のタブを閉じて開き直しても（ページが作り直されても）、同じ合図で二度は見せない。
let lastRevealedSerial = 0;

function findSettingElement(container: HTMLElement, label: string): HTMLElement | null {
  const candidates = container.querySelectorAll<HTMLElement>("h2, h3, label, .field-label, button");
  return [...candidates].find((element) => element.textContent?.trim() === label) ?? null;
}

// 名前（label）に結び付いた入力欄。label の for で指すか、label の中に入れてある。
function controlOf(element: HTMLElement): HTMLElement | null {
  if (element instanceof HTMLLabelElement) {
    return element.control;
  }
  return element instanceof HTMLButtonElement ? element : null;
}

export function useRevealSetting(request: SettingRevealRequest | null, containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!request || !container || request.serial <= lastRevealedSerial) {
      return;
    }
    lastRevealedSerial = request.serial;
    const element = findSettingElement(container, request.label);
    if (!element) {
      return;
    }
    element.scrollIntoView({ block: "center" });
    controlOf(element)?.focus({ preventScroll: true });
    const highlighted = element.closest<HTMLElement>(".setting-row, .field, .checkbox-line") ?? element;
    highlighted.classList.add("settings-revealed");
    // 片付けで外すと、開発中（StrictMode）は作用が 2 回走って、すぐ消えてしまう。光る動き（CSS の settings-revealed）が終わったら外す。
    highlighted.addEventListener("animationend", () => highlighted.classList.remove("settings-revealed"), { once: true });
    // 合図（serial）が変わったときだけ探す。
  }, [request?.serial]);
}

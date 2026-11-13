// フォーカスモードの間は、Esc でフォーカスモードを終わる（左上の戻るボタンと同じ）。
//
// 本文の中の Esc はエディタが止める（defaultPrevented になる）ので、エディタより先に、画面全体の捕捉の段階で受ける。
// ズームしている間の Esc はズームから戻る方（editor/zoomOutOnEscape.ts）に任せる。開いているメニュー・ダイアログ・入力欄の Esc と、
// 日本語の変換をやめる Esc でも終わらない。

import { useEffect } from "react";
import { isEscapeOwnedElsewhere } from "../shared/escapeOwners";
import { isImeKeyEvent } from "../shared/imeKeyEvent";

// PC でズームしている間に、窓いっぱいに重ねる表示（editor/NoteEditor.tsx）。
const ZOOMED_VIEW_SELECTOR = ".zoomed-view";
const DIALOG_SELECTOR = '[role="dialog"]';

export function useExitFocusModeOnEscape(focusMode: boolean, exitFocusMode: () => void): void {
  useEffect(() => {
    if (!focusMode) {
      return;
    }
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isImeKeyEvent(event)) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (isEscapeOwnedElsewhere(target) || document.querySelector(`${ZOOMED_VIEW_SELECTOR}, ${DIALOG_SELECTOR}`) !== null) {
        return;
      }
      exitFocusMode();
    };
    document.addEventListener("keydown", exitOnEscape, { capture: true });
    return () => document.removeEventListener("keydown", exitOnEscape, { capture: true });
  }, [focusMode, exitFocusMode]);
}

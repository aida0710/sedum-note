// ズームしている間は、Esc で 1 つ上の階層へ戻る（左上の戻るボタンと同じ）。
//   本文の中: エディタのキーの処理（ZoomOutOnEscape）で受ける。エディタは本文の中の Esc を必ず止める（ProseMirror の決まり）ので、
//             画面全体のキーの処理からは、本文の中の Esc が使われたかどうかを見分けられないため。
//   本文の外（戻るボタンや余白を押したあと）: 画面全体のキーの処理（useZoomOutOnEscape）で受ける。
// 開いているメニュー・ダイアログ・入力欄の Esc（それぞれを閉じる・やめる）と、日本語の変換をやめる Esc では戻らない。

import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { type RefObject, useEffect } from "react";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { zoomOutOneLevel } from "./zoom";

// 「/」の候補（既定の 100）が Esc で閉じるのを先にする。
const AFTER_SLASH_MENU = 50;

// Esc をそちらに任せる所（入力欄、ダイアログ、メモの中の検索の欄）。
const OWN_ESCAPE_SELECTOR = 'input, textarea, select, [role="dialog"], .find-bar';

// 開いているメニュー（「…」、文字を選んだときの色の見本など）があるか。あれば、Esc はそのメニューを閉じる（PopupMenu.tsx）。
function isMenuOpen(): boolean {
  return document.querySelector(".menu") !== null;
}

export const ZoomOutOnEscape = Extension.create({
  name: "zoomOutOnEscape",
  priority: AFTER_SLASH_MENU,
  addKeyboardShortcuts() {
    return { Escape: ({ editor }) => !isMenuOpen() && zoomOutOneLevel(editor as Editor) };
  },
});

export function useZoomOutOnEscape({ editor, isZoomed, noteArea }: { editor: Editor | null; isZoomed: boolean; noteArea: RefObject<HTMLElement | null> }): void {
  useEffect(() => {
    if (!editor || !isZoomed) {
      return;
    }
    const zoomOutOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || isImeKeyEvent(event)) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const isInThisNote = target === document.body || (target !== null && noteArea.current?.contains(target) === true);
      // 本文の中の Esc は、ZoomOutOnEscape が受ける。
      const isInBody = target !== null && editor.view.dom.contains(target);
      if (!isInThisNote || isInBody || target?.closest(OWN_ESCAPE_SELECTOR) || isMenuOpen()) {
        return;
      }
      event.preventDefault();
      zoomOutOneLevel(editor);
    };
    document.addEventListener("keydown", zoomOutOnEscape);
    return () => document.removeEventListener("keydown", zoomOutOnEscape);
  }, [editor, isZoomed, noteArea]);
}

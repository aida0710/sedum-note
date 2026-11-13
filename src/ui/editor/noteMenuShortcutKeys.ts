// メモの「…」のメニューで、項目の右に出すショートカットのキー。表記は設定の「ショートカット」の一覧と同じ（Mac では ⌘）。

import { shortcutTextOf } from "../shortcuts/shortcutBindings";

// キーで呼べない項目と、キーなしにした項目は null。
export type NoteMenuShortcutKeys = { findInNote: string | null; aiChat: string | null; zoomIntoCursor: string | null; foldAll: string | null; unfoldAll: string | null };

const NO_SHORTCUT_KEYS: NoteMenuShortcutKeys = { findInNote: null, aiChat: null, zoomIntoCursor: null, foldAll: null, unfoldAll: null };

type NoteMenuShortcutKeysInput = {
  // スマホの画面か。キーボードのショートカットは PC の画面だけが受ける（workspace/keyboardShortcuts.ts）。
  isMobile: boolean;
  // Ctrl+F で、このエディタの中の検索が開くか。画面分割の右側のメモでは、左のタブのメモの検索が開くので false。
  receivesFindShortcut: boolean;
};

export function noteMenuShortcutKeys({ isMobile, receivesFindShortcut }: NoteMenuShortcutKeysInput): NoteMenuShortcutKeys {
  if (isMobile) {
    return NO_SHORTCUT_KEYS;
  }
  return {
    findInNote: receivesFindShortcut ? shortcutTextOf("findInNote") : null,
    aiChat: shortcutTextOf("aiChat"),
    zoomIntoCursor: shortcutTextOf("zoomIntoCursor"),
    foldAll: shortcutTextOf("foldAll"),
    unfoldAll: shortcutTextOf("unfoldAll"),
  };
}

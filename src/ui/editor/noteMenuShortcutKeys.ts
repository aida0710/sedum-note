// メモの「…」のメニューで、項目の右に出すショートカットのキー。表記は設定の「ショートカット」の一覧と同じ（Mac では ⌘）。

import { shortcutText } from "../shared/shortcutKeys";
import { keysOfShortcut } from "../workspace/keyboardShortcuts";
import { ZOOM_INTO_CURSOR_KEYS } from "./zoom";

// キーで呼べない項目は null。
export type NoteMenuShortcutKeys = { findInNote: string | null; aiChat: string | null; zoomIntoCursor: string | null };

const NO_SHORTCUT_KEYS: NoteMenuShortcutKeys = { findInNote: null, aiChat: null, zoomIntoCursor: null };

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
    findInNote: receivesFindShortcut ? shortcutText(keysOfShortcut("findInNote")) : null,
    aiChat: shortcutText(keysOfShortcut("aiChat")),
    zoomIntoCursor: shortcutText(ZOOM_INTO_CURSOR_KEYS),
  };
}

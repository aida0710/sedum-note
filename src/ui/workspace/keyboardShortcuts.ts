// PC の画面の、どこでも効くキーボードショートカット（一覧と既定のキーは shortcuts/shortcutCatalog.ts の group: "app"）。
// キーは押されたときに、このデバイスの設定（変えたキー）から読む。

import { useEffect, useRef } from "react";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { shortcutBindings } from "../shortcuts/shortcutBindings";
import { type AppShortcutId, shortcutsOfGroup } from "../shortcuts/shortcutCatalog";
import { matchingShortcut } from "../shortcuts/shortcutMatching";

export const APP_SHORTCUT_IDS = shortcutsOfGroup("app").map((definition) => definition.id as AppShortcutId);

// 既定のキー。割り当てを変えたあとも、このキーではブラウザの動き（Ctrl+R の再読み込み、Ctrl+L のアドレス欄など）を止め続ける
// （押しただけで画面が読み込み直されて、ロックがかからないように）。
const DEFAULT_APP_BINDINGS = shortcutsOfGroup("app").map((definition) => ({ id: definition.id, keys: definition.defaultKeys }));

// ショートカットを効かせる。日本語の変換中と、ダイアログが開いている間は効かせない。
// ダイアログが開いている間も、ブラウザの動き（Ctrl+R の再読み込みなど）は止める。
export function useKeyboardShortcuts(handlers: Record<AppShortcutId, () => void>): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isImeKeyEvent(event)) {
        return;
      }
      const shortcutId = matchingShortcut(event, shortcutBindings(APP_SHORTCUT_IDS));
      if (shortcutId === null) {
        if (matchingShortcut(event, DEFAULT_APP_BINDINGS) !== null) {
          event.preventDefault();
        }
        return;
      }
      event.preventDefault();
      if (!document.querySelector('[role="dialog"]')) {
        handlersRef.current[shortcutId]();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

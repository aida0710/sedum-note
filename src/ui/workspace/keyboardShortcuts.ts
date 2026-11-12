// PC の画面のキーボードショートカット。ブラウザが自分で使うキー（Ctrl+N、Ctrl+T、Ctrl+W、Ctrl+Tab）は
// Web 版に届かないので、Alt を足した組み合わせにしている。Ctrl+K・Ctrl+F・Ctrl+R・Ctrl+L はブラウザの動きを止められるので、そのまま使う。
// Mac では Ctrl の代わりに Command。

import { useEffect, useRef } from "react";
import type { MessageKey } from "../i18n/translate";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { isApplePlatform, type ShortcutKeys } from "../shared/shortcutKeys";

export type ShortcutId = "commandPalette" | "newNote" | "dailyNote" | "searchNotes" | "findInNote" | "replaceInNote" | "nextTab" | "previousTab" | "closeTab" | "openSettings" | "graph" | "aiChat" | "focusMode" | "typewriterMode" | "lock";

export const KEYBOARD_SHORTCUTS: Array<{ id: ShortcutId; label: MessageKey; keys: ShortcutKeys }> = [
  { id: "commandPalette", label: "shortcut.commandPalette", keys: { key: "k" } },
  { id: "newNote", label: "shortcut.newNote", keys: { key: "n", alt: true } },
  { id: "dailyNote", label: "shortcut.dailyNote", keys: { key: "j", alt: true } },
  { id: "searchNotes", label: "shortcut.searchNotes", keys: { key: "f", shift: true } },
  { id: "findInNote", label: "shortcut.findInNote", keys: { key: "f" } },
  { id: "replaceInNote", label: "shortcut.replaceInNote", keys: { key: "r" } },
  { id: "nextTab", label: "shortcut.nextTab", keys: { key: "ArrowRight", alt: true } },
  { id: "previousTab", label: "shortcut.previousTab", keys: { key: "ArrowLeft", alt: true } },
  { id: "closeTab", label: "shortcut.closeTab", keys: { key: "w", alt: true } },
  { id: "openSettings", label: "shortcut.openSettings", keys: { key: "," } },
  { id: "graph", label: "graph.title", keys: { key: "g", alt: true } },
  { id: "aiChat", label: "ai.chat", keys: { key: "a", alt: true } },
  { id: "focusMode", label: "shortcut.focusMode", keys: { key: "f", alt: true } },
  { id: "typewriterMode", label: "shortcut.typewriterMode", keys: { key: "f", alt: true, shift: true } },
  { id: "lock", label: "settings.lock", keys: { key: "l" } },
];

function matches(event: KeyboardEvent, keys: ShortcutKeys): boolean {
  const modifier = isApplePlatform() ? event.metaKey : event.ctrlKey;
  // Alt を押すと key が別の文字になる配列があるので、文字のキーは物理的な位置（code）でも見る。
  const sameKey = event.key.toLowerCase() === keys.key.toLowerCase() || event.code === `Key${keys.key.toUpperCase()}`;
  return modifier && sameKey && event.altKey === Boolean(keys.alt) && event.shiftKey === Boolean(keys.shift);
}

// ショートカットを効かせる。日本語の変換中と、ダイアログが開いている間は効かせない。
// ダイアログが開いている間も、ブラウザの動き（Ctrl+R の再読み込みなど）は止める（押しただけで画面が読み込み直されないように）。
export function useKeyboardShortcuts(handlers: Record<ShortcutId, () => void>): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isImeKeyEvent(event)) {
        return;
      }
      const shortcut = KEYBOARD_SHORTCUTS.find((candidate) => matches(event, candidate.keys));
      if (!shortcut) {
        return;
      }
      event.preventDefault();
      if (!document.querySelector('[role="dialog"]')) {
        handlersRef.current[shortcut.id]();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

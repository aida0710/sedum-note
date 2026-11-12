// PC の画面のキーボードショートカット。ブラウザが自分で使うキー（Ctrl+N、Ctrl+T、Ctrl+W、Ctrl+Tab）は
// Web 版に届かないので、Alt を足した組み合わせにしている。Mac では Ctrl の代わりに Command。

import { useEffect, useRef } from "react";
import type { MessageKey } from "../i18n/translate";
import { isImeKeyEvent } from "../shared/imeKeyEvent";

export type ShortcutId = "newNote" | "searchNotes" | "findInNote" | "nextTab" | "previousTab" | "closeTab" | "openSettings";

type ShortcutKeys = { key: string; alt?: boolean; shift?: boolean };

export const KEYBOARD_SHORTCUTS: Array<{ id: ShortcutId; label: MessageKey; keys: ShortcutKeys }> = [
  { id: "newNote", label: "shortcut.newNote", keys: { key: "n", alt: true } },
  { id: "searchNotes", label: "shortcut.searchNotes", keys: { key: "f", shift: true } },
  { id: "findInNote", label: "shortcut.findInNote", keys: { key: "f" } },
  { id: "nextTab", label: "shortcut.nextTab", keys: { key: "ArrowRight", alt: true } },
  { id: "previousTab", label: "shortcut.previousTab", keys: { key: "ArrowLeft", alt: true } },
  { id: "closeTab", label: "shortcut.closeTab", keys: { key: "w", alt: true } },
  { id: "openSettings", label: "shortcut.openSettings", keys: { key: "," } },
];

export function isApplePlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

const KEY_NAMES: Record<string, string> = { ArrowRight: "→", ArrowLeft: "←" };

// 設定の一覧に出す表記（例: Ctrl + Alt + N、⌘ + ⌥ + N）。
export function shortcutText(keys: ShortcutKeys): string {
  const apple = isApplePlatform();
  const parts = [apple ? "⌘" : "Ctrl"];
  if (keys.alt) {
    parts.push(apple ? "⌥" : "Alt");
  }
  if (keys.shift) {
    parts.push(apple ? "⇧" : "Shift");
  }
  parts.push(KEY_NAMES[keys.key] ?? keys.key.toUpperCase());
  return parts.join(" + ");
}

function matches(event: KeyboardEvent, keys: ShortcutKeys): boolean {
  const modifier = isApplePlatform() ? event.metaKey : event.ctrlKey;
  // Alt を押すと key が別の文字になる配列があるので、文字のキーは物理的な位置（code）でも見る。
  const sameKey = event.key.toLowerCase() === keys.key.toLowerCase() || event.code === `Key${keys.key.toUpperCase()}`;
  return modifier && sameKey && event.altKey === Boolean(keys.alt) && event.shiftKey === Boolean(keys.shift);
}

// ショートカットを効かせる。日本語の変換中と、ダイアログが開いている間は効かせない。
export function useKeyboardShortcuts(handlers: Record<ShortcutId, () => void>): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isImeKeyEvent(event) || document.querySelector('[role="dialog"]')) {
        return;
      }
      const shortcut = KEYBOARD_SHORTCUTS.find((candidate) => matches(event, candidate.keys));
      if (shortcut) {
        event.preventDefault();
        handlersRef.current[shortcut.id]();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

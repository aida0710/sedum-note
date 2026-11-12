// キーボードショートカットのキーの組み合わせと、設定の一覧に出す表記。

// Ctrl（Mac では Command）と一緒に押すキー。
export type ShortcutKeys = { key: string; alt?: boolean; shift?: boolean };

export function isApplePlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

const KEY_NAMES: Record<string, string> = { ArrowRight: "→", ArrowLeft: "←", Enter: "Enter" };

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

// エディタ（Tiptap）のキーの書き方（例: Mod-Shift-Alt-Enter）。Mod は Ctrl（Mac では Command）。
export function editorKeymapName(keys: ShortcutKeys): string {
  return ["Mod", keys.shift ? "Shift" : null, keys.alt ? "Alt" : null, keys.key].filter(Boolean).join("-");
}

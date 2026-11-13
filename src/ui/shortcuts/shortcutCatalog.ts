// 変えられるキーボードショートカット（PC の画面）の一覧と、それぞれの既定のキー。
//   app: どこでも効く（workspace/keyboardShortcuts.ts が画面全体の keydown で受ける）。
//   body: 本文の中で効く。table: 表の中で効く（エディタの拡張が受ける。editor/editorShortcutPlugin.ts）。
// どれも同じキーの押し下げで照合するので、キーは一覧の全体で重ならないようにする（shortcutBindings.ts が断る）。
// ブラウザが自分で使うキー（Ctrl+N、Ctrl+T、Ctrl+W、Ctrl+Tab）は Web 版に届かないので、既定では Alt を足した組み合わせにしている。
// Ctrl+K・Ctrl+F・Ctrl+R・Ctrl+L はブラウザの動きを止められるので、そのまま使う。Mac では Ctrl の代わりに Command。

import type { MessageKey } from "../i18n/translate";
import type { ShortcutKeys } from "../shared/shortcutKeys";

export type ShortcutGroup = "app" | "body" | "table";

type ShortcutDefinition = { id: string; group: ShortcutGroup; label: MessageKey; defaultKeys: ShortcutKeys };

export const SHORTCUT_DEFINITIONS = [
  { id: "commandPalette", group: "app", label: "shortcut.commandPalette", defaultKeys: { key: "k" } },
  { id: "newNote", group: "app", label: "shortcut.newNote", defaultKeys: { key: "n", alt: true } },
  { id: "dailyNote", group: "app", label: "shortcut.dailyNote", defaultKeys: { key: "j", alt: true } },
  { id: "searchNotes", group: "app", label: "shortcut.searchNotes", defaultKeys: { key: "f", shift: true } },
  { id: "findInNote", group: "app", label: "shortcut.findInNote", defaultKeys: { key: "f" } },
  { id: "replaceInNote", group: "app", label: "shortcut.replaceInNote", defaultKeys: { key: "r" } },
  { id: "nextTab", group: "app", label: "shortcut.nextTab", defaultKeys: { key: "ArrowRight", alt: true } },
  { id: "previousTab", group: "app", label: "shortcut.previousTab", defaultKeys: { key: "ArrowLeft", alt: true } },
  { id: "closeTab", group: "app", label: "shortcut.closeTab", defaultKeys: { key: "w", alt: true } },
  { id: "reopenClosedTab", group: "app", label: "shortcut.reopenClosedTab", defaultKeys: { key: "t", alt: true, shift: true } },
  { id: "openSettings", group: "app", label: "shortcut.openSettings", defaultKeys: { key: "," } },
  { id: "graph", group: "app", label: "graph.title", defaultKeys: { key: "g", alt: true } },
  { id: "reminders", group: "app", label: "due.title", defaultKeys: { key: "e", alt: true } },
  { id: "aiChat", group: "app", label: "ai.chat", defaultKeys: { key: "a", alt: true } },
  { id: "focusMode", group: "app", label: "shortcut.focusMode", defaultKeys: { key: "f", alt: true } },
  { id: "typewriterMode", group: "app", label: "shortcut.typewriterMode", defaultKeys: { key: "f", alt: true, shift: true } },
  { id: "lock", group: "app", label: "settings.lock", defaultKeys: { key: "l" } },
  { id: "insertDate", group: "body", label: "editor.insertDate", defaultKeys: { key: "d", alt: true } },
  { id: "insertDateTime", group: "body", label: "editor.insertDateTime", defaultKeys: { key: "d", alt: true, shift: true } },
  // Ctrl+.（Mac は ⌘+.）は Logseq と同じキー。戻るのは Ctrl+Shift+. か Esc（zoomOutOnEscape.ts）。
  { id: "zoomIntoCursor", group: "body", label: "editor.zoomIntoCursor", defaultKeys: { key: "." } },
  { id: "zoomOutOneLevel", group: "body", label: "editor.zoomOutOneLevel", defaultKeys: { key: ".", shift: true } },
  { id: "foldAll", group: "body", label: "editor.foldAll", defaultKeys: { key: "[", alt: true } },
  { id: "unfoldAll", group: "body", label: "editor.unfoldAll", defaultKeys: { key: "]", alt: true } },
  // Notion と同じキー。
  { id: "moveBlockUp", group: "body", label: "editor.block.moveUp", defaultKeys: { key: "ArrowUp", shift: true } },
  { id: "moveBlockDown", group: "body", label: "editor.block.moveDown", defaultKeys: { key: "ArrowDown", shift: true } },
  { id: "duplicateBlock", group: "body", label: "editor.block.duplicate", defaultKeys: { key: "d" } },
  { id: "addRowAfter", group: "table", label: "editor.table.addRowAfter", defaultKeys: { key: "Enter" } },
  { id: "addRowBefore", group: "table", label: "editor.table.addRowBefore", defaultKeys: { key: "Enter", shift: true } },
  { id: "addColumnAfter", group: "table", label: "editor.table.addColumnAfter", defaultKeys: { key: "Enter", alt: true } },
  { id: "addColumnBefore", group: "table", label: "editor.table.addColumnBefore", defaultKeys: { key: "Enter", alt: true, shift: true } },
] as const satisfies readonly ShortcutDefinition[];

export type ShortcutId = (typeof SHORTCUT_DEFINITIONS)[number]["id"];
export type AppShortcutId = Extract<(typeof SHORTCUT_DEFINITIONS)[number], { group: "app" }>["id"];

type CatalogEntry = (typeof SHORTCUT_DEFINITIONS)[number];

export function shortcutDefinition(id: ShortcutId): ShortcutDefinition {
  return SHORTCUT_DEFINITIONS.find((definition) => definition.id === id)!;
}

export function shortcutsOfGroup(group: ShortcutGroup): CatalogEntry[] {
  return SHORTCUT_DEFINITIONS.filter((definition) => definition.group === group);
}

export function isShortcutId(id: string): id is ShortcutId {
  return SHORTCUT_DEFINITIONS.some((definition) => definition.id === id);
}

// 割り当てられないキー。エディタに組み込まれた書式と編集のキー（@tiptap の拡張と prosemirror の既定のキーから拾った）、
// コピー・貼り付け・元に戻す、ブラウザが文字の移動と選択に使うキー、Mac のアプリ全体のキー（終了・隠す・しまう）。
// 表の既定のキー（Ctrl+Enter など）は、表の中だけで組み込みのキーより先に受けるので、ここに入れても既定には戻せる。
export const RESERVED_SHORTCUT_KEYS: readonly ShortcutKeys[] = [
  ..."abceiuvxyzqhm".split("").map((key) => ({ key })),
  { key: "z", shift: true },
  ..."789bs".split("").map((key) => ({ key, shift: true })),
  ..."0123456c".split("").map((key) => ({ key, alt: true })),
  { key: "Enter" },
  ...["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].map((key) => ({ key })),
  ...["ArrowLeft", "ArrowRight"].map((key) => ({ key, shift: true })),
];

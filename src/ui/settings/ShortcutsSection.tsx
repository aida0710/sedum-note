// 設定: キーボードショートカットの一覧（PC の画面だけ）。

import { DATE_TIME_SHORTCUTS } from "../editor/insertDateTime";
import { ZOOM_SHORTCUTS } from "../editor/zoom";
import { FOLDING_SHORTCUTS } from "../editor/folding";
import { TABLE_SHORTCUTS } from "../editor/tableShortcuts";
import { type MessageKey, translate } from "../i18n/translate";
import { isApplePlatform, type ShortcutKeys, shortcutText } from "../shared/shortcutKeys";
import { KEYBOARD_SHORTCUTS } from "../workspace/keyboardShortcuts";

type ShortcutHint = { id: string; label: MessageKey; keysText: string };

function hintsOf(shortcuts: Array<{ id: string; label: MessageKey; keys: ShortcutKeys }>): ShortcutHint[] {
  return shortcuts.map(({ id, label, keys }) => ({ id, label, keysText: shortcutText(keys) }));
}

// 左の列のキー（sidebarKeyboard.ts）。Ctrl を使わないキーなので、表記をここで書く。
function sidebarHints(): ShortcutHint[] {
  const selectKeys = isApplePlatform() ? "⌘ / ⇧" : "Ctrl / Shift";
  return [
    { id: "sidebarMoveRow", label: "shortcut.sidebarMoveRow", keysText: "↑ / ↓" },
    { id: "sidebarExpandRow", label: "shortcut.sidebarExpandRow", keysText: "→ / ←" },
    { id: "sidebarSelectNotes", label: "shortcut.sidebarSelectNotes", keysText: translate("shortcut.clickWith", { keys: selectKeys }) },
  ];
}

function ShortcutList({ hints }: { hints: ShortcutHint[] }) {
  return (
    <dl className="shortcut-list">
      {hints.map((hint) => (
        <div key={hint.id}>
          <dt>{translate(hint.label)}</dt>
          <dd><kbd>{hint.keysText}</kbd></dd>
        </div>
      ))}
    </dl>
  );
}

export function ShortcutsSection() {
  return (
    <section className="settings-section">
      <h2>{translate("settings.shortcuts")}</h2>
      <ShortcutList hints={hintsOf(KEYBOARD_SHORTCUTS)} />
      <h3>{translate("settings.shortcuts.inSidebar")}</h3>
      <ShortcutList hints={sidebarHints()} />
      <h3>{translate("settings.shortcuts.inBody")}</h3>
      <ShortcutList hints={hintsOf([...DATE_TIME_SHORTCUTS, ...ZOOM_SHORTCUTS, ...FOLDING_SHORTCUTS])} />
      <h3>{translate("settings.shortcuts.inTable")}</h3>
      <ShortcutList hints={hintsOf(TABLE_SHORTCUTS)} />
    </section>
  );
}

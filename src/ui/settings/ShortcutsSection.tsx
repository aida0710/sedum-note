// 設定: キーボードショートカットの一覧（PC の画面だけ）。

import { DATE_TIME_SHORTCUTS } from "../editor/insertDateTime";
import { ZOOM_SHORTCUTS } from "../editor/zoom";
import { TABLE_SHORTCUTS } from "../editor/tableShortcuts";
import { type MessageKey, translate } from "../i18n/translate";
import { type ShortcutKeys, shortcutText } from "../shared/shortcutKeys";
import { KEYBOARD_SHORTCUTS } from "../workspace/keyboardShortcuts";

function ShortcutList({ shortcuts }: { shortcuts: Array<{ id: string; label: MessageKey; keys: ShortcutKeys }> }) {
  return (
    <dl className="shortcut-list">
      {shortcuts.map((shortcut) => (
        <div key={shortcut.id}>
          <dt>{translate(shortcut.label)}</dt>
          <dd><kbd>{shortcutText(shortcut.keys)}</kbd></dd>
        </div>
      ))}
    </dl>
  );
}

export function ShortcutsSection() {
  return (
    <section className="settings-section">
      <h2>{translate("settings.shortcuts")}</h2>
      <ShortcutList shortcuts={KEYBOARD_SHORTCUTS} />
      <h3>{translate("settings.shortcuts.inBody")}</h3>
      <ShortcutList shortcuts={[...DATE_TIME_SHORTCUTS, ...ZOOM_SHORTCUTS]} />
      <h3>{translate("settings.shortcuts.inTable")}</h3>
      <ShortcutList shortcuts={TABLE_SHORTCUTS} />
    </section>
  );
}

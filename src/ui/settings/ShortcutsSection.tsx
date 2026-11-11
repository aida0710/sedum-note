// 設定: キーボードショートカットの一覧（PC の画面だけ）。

import { translate } from "../i18n/translate";
import { KEYBOARD_SHORTCUTS, shortcutText } from "../workspace/keyboardShortcuts";

export function ShortcutsSection() {
  return (
    <section className="settings-section">
      <h2>{translate("settings.shortcuts")}</h2>
      <dl className="shortcut-list">
        {KEYBOARD_SHORTCUTS.map((shortcut) => (
          <div key={shortcut.id}>
            <dt>{translate(shortcut.label)}</dt>
            <dd><kbd>{shortcutText(shortcut.keys)}</kbd></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

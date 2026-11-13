// 設定: キーボードショートカット（PC の画面だけ）。どこでも効くキーと、本文・表の中のキーは、行ごとに変えられる
// （ShortcutKeyRow.tsx。このデバイスだけの設定）。左の列の矢印のキーは変えられないので、表記だけを出す。

import { useState } from "react";
import { useDevicePreferences } from "../preferences/devicePreferences";
import { translate, type MessageKey } from "../i18n/translate";
import { useDialogs } from "../shared/DialogProvider";
import { isApplePlatform } from "../shared/shortcutKeys";
import { resetAllShortcutKeys } from "../shortcuts/shortcutBindings";
import { type ShortcutGroup, type ShortcutId, shortcutsOfGroup } from "../shortcuts/shortcutCatalog";
import { ShortcutKeyRow } from "./ShortcutKeyRow";

type ShortcutHint = { id: string; label: MessageKey; keysText: string };

// 左の列のキー（sidebarKeyboard.ts）。Ctrl を使わないキーなので、表記をここで書く。
function sidebarHints(): ShortcutHint[] {
  const selectKeys = isApplePlatform() ? "⌘ / ⇧" : "Ctrl / Shift";
  return [
    { id: "sidebarMoveRow", label: "shortcut.sidebarMoveRow", keysText: "↑ / ↓" },
    { id: "sidebarExpandRow", label: "shortcut.sidebarExpandRow", keysText: "→ / ←" },
    { id: "sidebarSelectNotes", label: "shortcut.sidebarSelectNotes", keysText: translate("shortcut.clickWith", { keys: selectKeys }) },
  ];
}

export function ShortcutsSection() {
  const { shortcutOverrides } = useDevicePreferences();
  const dialogs = useDialogs();
  // キーを待っている行。
  const [recordingId, setRecordingId] = useState<ShortcutId | null>(null);
  const rowsOf = (group: ShortcutGroup) => (
    <dl className="shortcut-list">
      {shortcutsOfGroup(group).map(({ id }) => (
        <ShortcutKeyRow key={id} id={id} overrides={shortcutOverrides} recording={recordingId === id}
          onRecordingChange={(recording) => setRecordingId(recording ? id : null)} />
      ))}
    </dl>
  );
  const resetAll = async () => {
    const accepted = await dialogs.confirm({ message: translate("shortcut.resetAllConfirm"), confirmLabel: translate("shortcut.resetAll") });
    if (accepted) {
      resetAllShortcutKeys();
    }
  };
  return (
    <section className="settings-section">
      <h2>{translate("settings.shortcuts")}</h2>
      <p className="hint">{translate("settings.shortcuts.description", { modifier: isApplePlatform() ? "⌘" : "Ctrl" })}</p>
      {rowsOf("app")}
      <h3>{translate("settings.shortcuts.inSidebar")}</h3>
      <dl className="shortcut-list">
        {sidebarHints().map((hint) => (
          <div key={hint.id} className="shortcut-row">
            <dt>{translate(hint.label)}</dt>
            <dd><kbd>{hint.keysText}</kbd></dd>
          </div>
        ))}
      </dl>
      <h3>{translate("settings.shortcuts.inBody")}</h3>
      {rowsOf("body")}
      <h3>{translate("settings.shortcuts.inTable")}</h3>
      {rowsOf("table")}
      <div className="form-actions">
        <button type="button" className="secondary-button" disabled={Object.keys(shortcutOverrides).length === 0} onClick={() => void resetAll()}>
          {translate("shortcut.resetAll")}
        </button>
      </div>
    </section>
  );
}

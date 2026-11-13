// 設定の「ショートカット」の 1 行。キーのボタンを押すと、次に押したキーの組み合わせを、そのショートカットのキーにする
// （押した瞬間に保存する。選ぶ項目と同じ）。Esc でやめ、Backspace か Delete でキーなしにする。
// 割り当てられないキー（エディタや OS が使う、ほかのショートカットが使っている）は、変えずに理由を出す。

import { useEffect, useState } from "react";
import { translate } from "../i18n/translate";
import { isImeKeyEvent } from "../shared/imeKeyEvent";
import { isApplePlatform, shortcutText } from "../shared/shortcutKeys";
import { assignShortcutKeys, isShortcutChanged, resetShortcutKeys, shortcutKeysOf, type ShortcutKeysProblem } from "../shortcuts/shortcutBindings";
import { shortcutDefinition, type ShortcutId } from "../shortcuts/shortcutCatalog";
import { capturedShortcut } from "../shortcuts/shortcutMatching";
import type { ShortcutOverrides } from "../shortcuts/shortcutOverrides";

function problemText(problem: ShortcutKeysProblem, keysText: string, { resetting }: { resetting: boolean }): string {
  if (problem.kind === "reserved") {
    return translate("shortcut.problem.reserved", { keys: keysText });
  }
  return translate(resetting ? "shortcut.problem.defaultInUse" : "shortcut.problem.inUse", { keys: keysText, name: translate(shortcutDefinition(problem.shortcutId).label) });
}

const hasAnyModifier = (event: KeyboardEvent) => event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;

type ShortcutKeyRowProps = {
  id: ShortcutId;
  overrides: ShortcutOverrides;
  // この行がキーを待っているか。待つのは一度に 1 行だけ。
  recording: boolean;
  onRecordingChange: (recording: boolean) => void;
};

export function ShortcutKeyRow({ id, overrides, recording, onRecordingChange }: ShortcutKeyRowProps) {
  const [message, setMessage] = useState<string | null>(null);
  const name = translate(shortcutDefinition(id).label);
  const keys = shortcutKeysOf(id, overrides);
  useEffect(() => {
    if (!recording) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (isImeKeyEvent(event)) {
        return;
      }
      // 待っている間に押したキーは、ほかのショートカットや本文に渡さない（いちばん先の capture で受けて止める）。
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape" && !hasAnyModifier(event)) {
        setMessage(null);
        onRecordingChange(false);
        return;
      }
      if ((event.key === "Backspace" || event.key === "Delete") && !hasAnyModifier(event)) {
        assignShortcutKeys(id, null);
        setMessage(null);
        onRecordingChange(false);
        return;
      }
      const captured = capturedShortcut(event);
      if (captured.kind === "modifierOnly") {
        return;
      }
      if (captured.kind === "needsModifier") {
        setMessage(translate("shortcut.problem.needsModifier", { modifier: isApplePlatform() ? "⌘" : "Ctrl" }));
        return;
      }
      if (captured.kind === "unsupported") {
        setMessage(translate("shortcut.problem.unsupported"));
        return;
      }
      const problem = assignShortcutKeys(id, captured.keys);
      setMessage(problem && problemText(problem, shortcutText(captured.keys), { resetting: false }));
      if (!problem) {
        onRecordingChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [id, recording, onRecordingChange]);

  const reset = () => {
    const problem = resetShortcutKeys(id);
    setMessage(problem && problemText(problem, shortcutText(shortcutDefinition(id).defaultKeys), { resetting: true }));
  };
  return (
    <div className="shortcut-row">
      <dt>{name}</dt>
      <dd>
        <button type="button" className={`shortcut-keys${recording ? " recording" : ""}`} aria-label={translate("shortcut.change", { name })} aria-pressed={recording}
          onClick={() => {
            setMessage(null);
            onRecordingChange(!recording);
          }}
          onBlur={() => recording && onRecordingChange(false)}>
          {recording ? translate("shortcut.recording") : keys ? <kbd>{shortcutText(keys)}</kbd> : translate("shortcut.none")}
        </button>
        {isShortcutChanged(id, overrides) && !recording && (
          <button type="button" className="text-button" aria-label={translate("shortcut.resetOf", { name })} onClick={reset}>{translate("shortcut.reset")}</button>
        )}
      </dd>
      {message && <p className="form-error shortcut-message" role="alert">{message}</p>}
    </div>
  );
}

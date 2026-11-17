// 設定の「パスフレーズを変更」の欄。このデバイスのロックを解除するパスフレーズを変える。

import { useState } from "react";
import { MIN_PASSPHRASE_LENGTH } from "../../core/crypto/passphraseKey";
import { WeakPassphraseError, WrongPassphraseError } from "../../core/vault/vaultDocument";
import { translate } from "../i18n/translate";
import type { VaultSession } from "../session/useVaultSession";
import { preventSubmitByImeKey } from "../shared/imeKeyEvent";
import { PassphraseGenerator } from "../shared/PassphraseGenerator";
import { ProgressStatus } from "../shared/ProgressStatus";
import { useAsyncAction } from "../shared/useAsyncAction";
import { FieldError, fieldErrorAttributes, useFocusOnFieldError } from "../shared/FieldError";

const CURRENT_FIELD_ID = "current-passphrase";
const NEW_FIELD_ID = "new-passphrase";
const NEW_HINT_ID = "new-passphrase-hint";

// 失敗を出す欄。今のパスフレーズの間違いは今の欄、短すぎる新しいパスフレーズは新しい欄。ほかの失敗は null（フォームの下）。
function fieldOfFailure(error: unknown): string | null {
  if (error instanceof WrongPassphraseError) {
    return CURRENT_FIELD_ID;
  }
  if (error instanceof WeakPassphraseError) {
    return NEW_FIELD_ID;
  }
  return null;
}

export function PassphraseSection({ session }: { session: VaultSession }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [changed, setChanged] = useState(false);
  const change = useAsyncAction(session.changePassphrase);
  const failedFieldId = fieldOfFailure(change.error);
  useFocusOnFieldError(failedFieldId, change.error);
  const problemOf = (fieldId: string) => (failedFieldId === fieldId ? change.errorMessage : null);
  const formProblem = failedFieldId === null ? change.errorMessage : null;
  return (
    <form className="settings-section" onKeyDown={preventSubmitByImeKey} onSubmit={async (event) => {
      event.preventDefault();
      setChanged(false);
      if (await change.run({ current, next })) {
        setChanged(true);
        setCurrent("");
        setNext("");
      }
    }}>
      <h2>{translate("settings.passphrase")}</h2>
      <p>{translate("settings.passphraseDescription")}</p>
      <div className="field-grid">
        <div className="field">
          <label htmlFor={CURRENT_FIELD_ID}>{translate("settings.currentPassphrase")}</label>
          <input id={CURRENT_FIELD_ID} type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" required
            {...fieldErrorAttributes(CURRENT_FIELD_ID, problemOf(CURRENT_FIELD_ID))} />
          <FieldError fieldId={CURRENT_FIELD_ID} message={problemOf(CURRENT_FIELD_ID)} />
        </div>
        <div className="field">
          <label htmlFor={NEW_FIELD_ID}>{translate("settings.newPassphrase")}</label>
          <input id={NEW_FIELD_ID} type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" required
            {...fieldErrorAttributes(NEW_FIELD_ID, problemOf(NEW_FIELD_ID), NEW_HINT_ID)} />
          <span className="hint" id={NEW_HINT_ID}>{translate("setup.passphraseHint", { minimum: MIN_PASSPHRASE_LENGTH })}</span>
          <FieldError fieldId={NEW_FIELD_ID} message={problemOf(NEW_FIELD_ID)} />
        </div>
      </div>
      <PassphraseGenerator passphrase={next} onGenerate={setNext} />
      {formProblem && <div className="form-error" role="alert">{formProblem}</div>}
      <div className="form-actions">
        {change.busy && <ProgressStatus label={translate("settings.passphraseChanging")} progress={null} />}
        {changed && <span className="form-success">{translate("settings.passphraseChanged")}</span>}
        <button type="submit" className="secondary-button" disabled={change.busy}>{translate("settings.passphrase")}</button>
      </div>
    </form>
  );
}

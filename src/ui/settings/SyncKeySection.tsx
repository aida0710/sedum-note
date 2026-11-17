// 設定の「暗号化キー」の欄。同期先の暗号化キーを作り直す。作り直しても、メモは暗号化し直さない
// （同期先の vault.json を、新しいキーで包み直すだけ）。

import { useState } from "react";
import { WrongPassphraseError } from "../../core/vault/vaultDocument";
import { translate } from "../i18n/translate";
import type { VaultSession } from "../session/useVaultSession";
import { ProgressStatus } from "../shared/ProgressStatus";
import { useAsyncAction } from "../shared/useAsyncAction";
import { chosenSyncKey, findNewSyncKeyProblem, GENERATED_SYNC_KEY, NewSyncKeyChoice } from "../sync/NewSyncKeyChoice";
import { preventSubmitByImeKey } from "../shared/imeKeyEvent";
import { FieldError, fieldErrorAttributes, focusFieldWithError, useFocusOnFieldError } from "../shared/FieldError";

const SYNC_KEY_FIELD_ID = "replacement-sync-key";
const PASSPHRASE_FIELD_ID = "sync-key-passphrase";
const PASSPHRASE_HINT_ID = "sync-key-passphrase-hint";

export function SyncKeySection({ session }: { session: VaultSession }) {
  const [passphrase, setPassphrase] = useState("");
  const [newSyncKey, setNewSyncKey] = useState(GENERATED_SYNC_KEY);
  const [confirmed, setConfirmed] = useState(false);
  const [replaced, setReplaced] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const replace = useAsyncAction(session.replaceSyncKey);
  // パスフレーズの間違いはパスフレーズの欄の下、新しいキーの誤りはキーの欄の下、ほかの失敗はフォームの下に出す。
  const isWrongPassphrase = replace.error instanceof WrongPassphraseError;
  useFocusOnFieldError(isWrongPassphrase ? PASSPHRASE_FIELD_ID : null, replace.error);
  const passphraseProblem = isWrongPassphrase ? replace.errorMessage : null;
  const formProblem = isWrongPassphrase ? null : replace.errorMessage;
  return (
    <form className="settings-section" onKeyDown={preventSubmitByImeKey} onSubmit={async (event) => {
      event.preventDefault();
      setReplaced(false);
      const newSyncKeyProblem = findNewSyncKeyProblem(newSyncKey);
      setProblem(newSyncKeyProblem);
      if (newSyncKeyProblem !== null) {
        focusFieldWithError(SYNC_KEY_FIELD_ID);
      }
      if (newSyncKeyProblem === null && await replace.run({ passphrase, syncKey: chosenSyncKey(newSyncKey) })) {
        setReplaced(true);
        setPassphrase("");
        setNewSyncKey(GENERATED_SYNC_KEY);
        setConfirmed(false);
      }
    }}>
      <h2>{translate("settings.syncKey")}</h2>
      <p>{translate("settings.syncKeyDescription")}</p>
      <NewSyncKeyChoice inputId={SYNC_KEY_FIELD_ID} value={newSyncKey} onChange={setNewSyncKey} problem={problem} />
      <div className="field">
        <label htmlFor={PASSPHRASE_FIELD_ID}>{translate("settings.syncPassphrase")}</label>
        <input id={PASSPHRASE_FIELD_ID} type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="current-password" required
          {...fieldErrorAttributes(PASSPHRASE_FIELD_ID, passphraseProblem, PASSPHRASE_HINT_ID)} />
        <span className="hint" id={PASSPHRASE_HINT_ID}>{translate("settings.syncPassphraseHint")}</span>
        <FieldError fieldId={PASSPHRASE_FIELD_ID} message={passphraseProblem} />
      </div>
      <label className="checkbox-line">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        {translate("settings.syncKeyConfirm")}
      </label>
      {formProblem && <div className="form-error" role="alert">{formProblem}</div>}
      <div className="form-actions">
        {replace.busy && <ProgressStatus label={translate("settings.syncKeyReplacing")} progress={null} />}
        {replaced && <span className="form-success">{translate("settings.syncKeyReplaced")}</span>}
        <button type="submit" className="secondary-button" disabled={replace.busy || !confirmed}>{translate("settings.syncKeyReplace")}</button>
      </div>
    </form>
  );
}

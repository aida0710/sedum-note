// 設定の「暗号化キー」の欄。同期先の暗号化キーを作り直す。作り直しても、メモは暗号化し直さない
// （同期先の vault.json を、新しいキーで包み直すだけ）。

import { useState } from "react";
import { translate } from "../i18n/translate";
import type { VaultSession } from "../session/useVaultSession";
import { useAsyncAction } from "../shared/useAsyncAction";
import { chosenSyncKey, findNewSyncKeyProblem, GENERATED_SYNC_KEY, NewSyncKeyChoice } from "../sync/NewSyncKeyChoice";

export function SyncKeySection({ session }: { session: VaultSession }) {
  const [passphrase, setPassphrase] = useState("");
  const [newSyncKey, setNewSyncKey] = useState(GENERATED_SYNC_KEY);
  const [confirmed, setConfirmed] = useState(false);
  const [replaced, setReplaced] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const replace = useAsyncAction(session.replaceSyncKey);
  const message = problem ?? replace.errorMessage;
  return (
    <form className="settings-section" onSubmit={async (event) => {
      event.preventDefault();
      setReplaced(false);
      const newSyncKeyProblem = findNewSyncKeyProblem(newSyncKey);
      setProblem(newSyncKeyProblem);
      if (newSyncKeyProblem === null && await replace.run({ passphrase, syncKey: chosenSyncKey(newSyncKey) })) {
        setReplaced(true);
        setPassphrase("");
        setNewSyncKey(GENERATED_SYNC_KEY);
        setConfirmed(false);
      }
    }}>
      <h2>{translate("settings.syncKey")}</h2>
      <p>{translate("settings.syncKeyDescription")}</p>
      <NewSyncKeyChoice inputId="replacement-sync-key" value={newSyncKey} onChange={setNewSyncKey} />
      <div className="field">
        <label htmlFor="sync-key-passphrase">{translate("settings.syncPassphrase")}</label>
        <input id="sync-key-passphrase" type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="current-password" required />
        <span className="hint">{translate("settings.syncPassphraseHint")}</span>
      </div>
      <label className="checkbox-line">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        {translate("settings.syncKeyConfirm")}
      </label>
      {message && <div className="form-error" role="alert">{message}</div>}
      <div className="form-actions">
        {replaced && <span className="form-success">{translate("settings.syncKeyReplaced")}</span>}
        <button type="submit" className="secondary-button" disabled={replace.busy || !confirmed}>{translate("settings.syncKeyReplace")}</button>
      </div>
    </form>
  );
}

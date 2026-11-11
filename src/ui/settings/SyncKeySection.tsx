// 設定の「暗号化キー」の欄。同期先の暗号化キーを作り直す。v0.2 までの同期先（パスフレーズで包んだ形）なら、
// そのことを知らせて、新しい形にする。作り直しても、メモは暗号化し直さない（vault.json を包み直すだけ）。

import { useEffect, useState } from "react";
import type { RemoteConfig } from "../../core/remote/remoteConfig";
import { MIN_SYNC_KEY_LENGTH } from "../../core/vault/vaultDocument";
import { translate } from "../i18n/translate";
import type { VaultSession } from "../session/useVaultSession";
import { useAsyncAction } from "../shared/useAsyncAction";

export function SyncKeySection({ session, remoteConfig }: { session: VaultSession; remoteConfig: RemoteConfig }) {
  const [passphrase, setPassphrase] = useState("");
  const [choosesOwnKey, setChoosesOwnKey] = useState(false);
  const [ownKey, setOwnKey] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [replaced, setReplaced] = useState(false);
  // 同期先が v0.2 までの形か。確かめられなければ（つながらないなど）null のままで、知らせを出さない。
  const [usesLegacyWrapping, setUsesLegacyWrapping] = useState<boolean | null>(null);
  const { inspectConnectedRemote } = session;
  useEffect(() => {
    let cancelled = false;
    inspectConnectedRemote()
      .then((inspected) => {
        if (!cancelled) {
          setUsesLegacyWrapping(inspected?.state === "existing" ? inspected.keyWrapping === "passphrase" : null);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // 同期先を付け替えたときと、作り直したあとに確かめ直す。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteConfig, replaced]);
  const replace = useAsyncAction(session.replaceSyncKey);
  return (
    <form className="settings-section" onSubmit={async (event) => {
      event.preventDefault();
      setReplaced(false);
      if (await replace.run({ passphrase, syncKey: choosesOwnKey ? ownKey : null })) {
        setReplaced(true);
        setPassphrase("");
        setOwnKey("");
        setConfirmed(false);
      }
    }}>
      <h2>{translate("settings.syncKey")}</h2>
      <p>{translate("settings.syncKeyDescription")}</p>
      {usesLegacyWrapping && <p className="form-notice" role="status">{translate("settings.syncKeyLegacy")}</p>}
      <div className="field">
        <label htmlFor="sync-key-passphrase">{translate("settings.syncPassphrase")}</label>
        <input id="sync-key-passphrase" type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="current-password" required />
      </div>
      <label className="checkbox-line">
        <input type="checkbox" checked={choosesOwnKey} onChange={(event) => setChoosesOwnKey(event.target.checked)} />
        {translate("syncTarget.chooseOwnKey")}
      </label>
      {choosesOwnKey && (
        <div className="field">
          <label htmlFor="new-sync-key">{translate("settings.newSyncKey")}</label>
          <input id="new-sync-key" type="password" value={ownKey} onChange={(event) => setOwnKey(event.target.value)} autoComplete="off" spellCheck={false} required />
          <span className="hint">{translate("syncTarget.ownKeyHint", { minimum: MIN_SYNC_KEY_LENGTH })}</span>
        </div>
      )}
      <label className="checkbox-line">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        {translate(usesLegacyWrapping ? "settings.syncKeyConfirmLegacy" : "settings.syncKeyConfirm")}
      </label>
      {replace.errorMessage && <div className="form-error" role="alert">{replace.errorMessage}</div>}
      <div className="form-actions">
        {replaced && <span className="form-success">{translate("settings.syncKeyReplaced")}</span>}
        <button type="submit" className="secondary-button" disabled={replace.busy || !confirmed}>{translate("settings.syncKeyReplace")}</button>
      </div>
    </form>
  );
}

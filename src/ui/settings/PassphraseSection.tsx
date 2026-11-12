// 設定の「パスフレーズを変更」の欄。このデバイスのロックを解除するパスフレーズを変える。

import { useState } from "react";
import { MIN_PASSPHRASE_LENGTH } from "../../core/crypto/passphraseKey";
import { translate } from "../i18n/translate";
import type { VaultSession } from "../session/useVaultSession";
import { preventSubmitByImeKey } from "../shared/imeKeyEvent";
import { PassphraseGenerator } from "../shared/PassphraseGenerator";
import { useAsyncAction } from "../shared/useAsyncAction";

export function PassphraseSection({ session }: { session: VaultSession }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [changed, setChanged] = useState(false);
  const change = useAsyncAction(session.changePassphrase);
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
          <label htmlFor="current-passphrase">{translate("settings.currentPassphrase")}</label>
          <input id="current-passphrase" type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" required />
        </div>
        <div className="field">
          <label htmlFor="new-passphrase">{translate("settings.newPassphrase")}</label>
          <input id="new-passphrase" type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" required />
          <span className="hint">{translate("setup.passphraseHint", { minimum: MIN_PASSPHRASE_LENGTH })}</span>
        </div>
      </div>
      <PassphraseGenerator passphrase={next} onGenerate={setNext} />
      {change.errorMessage && <div className="form-error" role="alert">{change.errorMessage}</div>}
      <div className="form-actions">
        {changed && <span className="form-success">{translate("settings.passphraseChanged")}</span>}
        <button type="submit" className="secondary-button" disabled={change.busy}>{translate("settings.passphrase")}</button>
      </div>
    </form>
  );
}

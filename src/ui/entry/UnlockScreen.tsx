import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import { translate } from "../i18n/translate";
import type { VaultSession } from "../session/useVaultSession";
import { WipeDeviceDataButton } from "../session/WipeDeviceDataButton";
import { useAsyncAction } from "../shared/useAsyncAction";
import { preventSubmitByImeKey } from "../shared/imeKeyEvent";

export function UnlockScreen({ session }: { session: VaultSession }) {
  const [passphrase, setPassphrase] = useState("");
  const action = useAsyncAction(session.unlock);
  return (
    <div className="entry">
      <form className="entry-card" onKeyDown={preventSubmitByImeKey} onSubmit={(event) => { event.preventDefault(); void action.run(passphrase); }}>
        <h1><LockKeyhole size={20} />{translate("unlock.title")}</h1>
        <p className="description">{translate("unlock.description")}</p>
        <div className="field">
          <label htmlFor="unlock-passphrase">{translate("setup.passphrase")}</label>
          <input id="unlock-passphrase" type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="current-password" autoFocus required />
        </div>
        {action.errorMessage && <div className="form-error" role="alert">{action.errorMessage}</div>}
        <div className="form-actions">
          {action.busy && <span className="hint">{translate("unlock.working")}</span>}
          <button className="primary-button" type="submit" disabled={action.busy}>{translate("unlock.submit")}</button>
        </div>
        <details>
          <summary>{translate("wipe.forgotPassphrase")}</summary>
          <p className="description">{translate("wipe.forgotPassphraseDescription")}</p>
          <WipeDeviceDataButton session={session} />
        </details>
      </form>
    </div>
  );
}

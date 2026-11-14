import { useState } from "react";
import { translate } from "../i18n/translate";
import { spaceDisplayName } from "../session/spaceDisplayName";
import { selectSpace, useSpaceRegistry } from "../session/spaceRegistry";
import type { VaultSession } from "../session/useVaultSession";
import { WipeDeviceDataButton } from "../session/WipeDeviceDataButton";
import { useAsyncAction } from "../shared/useAsyncAction";
import { preventSubmitByImeKey } from "../shared/imeKeyEvent";
import { updateDevicePreferences, useDevicePreferences } from "../preferences/devicePreferences";
import { EntryBrand } from "./EntryBrand";

export function UnlockScreen({ session, spaceId }: { session: VaultSession; spaceId: string }) {
  const { spaces } = useSpaceRegistry();
  const [passphrase, setPassphrase] = useState("");
  const action = useAsyncAction(session.unlock);
  const { customCss, customCssEnabled } = useDevicePreferences();
  return (
    <div className="entry unlock-entry">
      <form className="entry-card" onKeyDown={preventSubmitByImeKey} onSubmit={(event) => { event.preventDefault(); void action.run(passphrase); }}>
        <EntryBrand />
        <h1>{translate("unlock.title")}</h1>
        <p className="description">{translate("unlock.description")}</p>
        {spaces.length > 1 && (
          <div className="field">
            <label htmlFor="unlock-space">{translate("space.label")}</label>
            <select id="unlock-space" value={spaceId} onChange={(event) => selectSpace(event.target.value)}>
              {spaces.map((space) => <option key={space.id} value={space.id}>{spaceDisplayName(space)}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="unlock-passphrase">{translate("setup.passphrase")}</label>
          <input id="unlock-passphrase" type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="current-password" autoFocus required />
        </div>
        {action.errorMessage && <div className="form-error" role="alert">{action.errorMessage}</div>}
        {customCssEnabled && customCss.trim() !== "" && (
          <label className="checkbox-line">
            <input type="checkbox" checked={false} onChange={() => updateDevicePreferences({ customCssEnabled: false })} />
            {translate("unlock.turnOffCustomCss")}
          </label>
        )}
        <details>
          <summary>{translate("wipe.forgotPassphrase")}</summary>
          <p className="description">{translate("wipe.forgotPassphraseDescription")}</p>
          <WipeDeviceDataButton session={session} />
        </details>
        {/* ボタンの行は、カードの下の端に固定する（.entry-card > .form-actions）ので、いちばん後ろに置く。 */}
        <div className="form-actions">
          {action.busy && <span className="hint">{translate("unlock.working")}</span>}
          <button className="primary-button" type="submit" disabled={action.busy}>{translate("unlock.submit")}</button>
        </div>
      </form>
    </div>
  );
}

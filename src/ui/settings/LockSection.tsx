// 設定の「ロック」の欄。このデバイスのメモを、パスフレーズを入れるまで開けない状態にする。

import { translate } from "../i18n/translate";
import type { VaultSession } from "../session/useVaultSession";

export function LockSection({ session }: { session: VaultSession }) {
  return (
    <section className="settings-section">
      <h2>{translate("settings.lock")}</h2>
      <p>{translate("settings.lockDescription")}</p>
      <div className="form-actions"><button type="button" className="secondary-button" onClick={() => void session.lock()}>{translate("settings.lockNow")}</button></div>
    </section>
  );
}

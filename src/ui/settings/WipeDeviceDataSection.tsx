// 設定の「このデバイスのデータを消す」の欄。同期先のメモは消えない。

import { translate } from "../i18n/translate";
import { WipeDeviceDataButton } from "../session/WipeDeviceDataButton";
import type { VaultSession } from "../session/useVaultSession";

export function WipeDeviceDataSection({ session }: { session: VaultSession }) {
  return (
    <section className="settings-section">
      <h2>{translate("wipe.title")}</h2>
      <p>{translate("wipe.description")}</p>
      <WipeDeviceDataButton session={session} />
    </section>
  );
}

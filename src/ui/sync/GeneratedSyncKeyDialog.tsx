// 生成した暗号化キーを 1 度だけ見せるダイアログ。閉じたら、アプリはこのキーをどこにも持っていない
// （同期先には、このキーで包んだマスターキーだけがある）。sshc と同じく、あとから表示し直せない。

import { translate } from "../i18n/translate";
import { ModalDialog } from "../shared/ModalDialog";

export function GeneratedSyncKeyDialog({ syncKey, onClose }: { syncKey: string; onClose: () => void }) {
  return (
    // 背景を押しただけで消えないように、閉じるのは「控えました」のボタンだけにする。
    <ModalDialog label={translate("syncKey.generatedTitle")} title={translate("syncKey.generatedTitle")} onClose={() => undefined}>
      <p>{translate("syncKey.generatedDescription")}</p>
      <div className="generated-passphrase">
        <code>{syncKey}</code>
        <button type="button" className="secondary-button" onClick={() => void navigator.clipboard.writeText(syncKey)}>{translate("passphrase.copy")}</button>
      </div>
      <div className="form-actions">
        <button type="button" className="primary-button" onClick={onClose}>{translate("syncKey.noted")}</button>
      </div>
    </ModalDialog>
  );
}

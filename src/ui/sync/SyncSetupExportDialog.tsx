// 同期の設定を、ほかのデバイスへ渡すダイアログ。QR を出し、ファイルにも保存できる。
// 渡すものは暗号化キーが無いと読めない（core/vault/syncSetupFile.ts）。

import { useEffect, useState } from "react";
import { translate } from "../i18n/translate";
import { fileNameDate } from "../platform/fileNameDate";
import { saveFile } from "../platform/saveFile";
import { ModalDialog } from "../shared/ModalDialog";
import { useAsyncAction } from "../shared/useAsyncAction";
import { SYNC_SETUP_FILE_EXTENSION } from "./syncSetupFileName";
import { renderSyncSetupQrCode } from "./syncSetupQrCode";

export function SyncSetupExportDialog({ setup, onClose }: { setup: string; onClose: () => void }) {
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void renderSyncSetupQrCode(setup).then((image) => {
      if (!cancelled) {
        setQrCodeImage(image);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [setup]);
  const save = useAsyncAction(async () => {
    setSaved(await saveFile({
      suggestedName: `sedum-note-sync-${fileNameDate(new Date())}.${SYNC_SETUP_FILE_EXTENSION}`,
      parts: [new TextEncoder().encode(setup)],
      mimeType: "application/json",
    }));
  });
  return (
    <ModalDialog label={translate("syncSetup.exportTitle")} title={translate("syncSetup.exportTitle")} className="sync-setup-export" onClose={onClose}>
      <p>{translate("syncSetup.exportDescription")}</p>
      {qrCodeImage && <img className="sync-setup-qr" src={qrCodeImage} alt={translate("syncSetup.qrCodeLabel")} />}
      {save.errorMessage && <div className="form-error" role="alert">{save.errorMessage}</div>}
      <div className="form-actions">
        {saved && <span className="form-success">{translate("syncSetup.saved")}</span>}
        {/* 「閉じる」を主のボタンにするのは、ほかに決める操作が無いダイアログだけ。ここでは、ファイルへの保存が主。 */}
        <button type="button" className="secondary-button" onClick={onClose}>{translate("common.close")}</button>
        <button type="button" className="primary-button" disabled={save.busy} onClick={() => void save.run(undefined)}>{translate("syncSetup.saveFile")}</button>
      </div>
    </ModalDialog>
  );
}

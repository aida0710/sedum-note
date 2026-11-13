// 最初の画面と設定の「同期」で、ほかのデバイスが書き出した同期の設定（ファイルか QR）を取り込む欄。
// 暗号化キーを入れると、設定を開いて同期先の欄に入れ、そのまま接続を確かめる。同じ暗号化キーを、参加にも使う。

import { Camera, QrCode, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { isSyncSetup, openSyncSetup } from "../../core/vault/syncSetupFile";
import { translate } from "../i18n/translate";
import { UserFacingError } from "../i18n/userFacingError";
import { useAsyncAction } from "../shared/useAsyncAction";
import { SYNC_SETUP_FILE_EXTENSION } from "./syncSetupFileName";
import { QrCodeScannerDialog } from "./QrCodeScannerDialog";
import { canUseCamera, readQrCodeFromImage } from "./syncSetupQrCode";
import type { SyncTargetForm } from "./useSyncTargetForm";

export function SyncSetupImport({ form }: { form: SyncTargetForm }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const qrCodeInput = useRef<HTMLInputElement>(null);
  // 読み込んだ同期の設定の文書。暗号化キーを入れるまでは、中身は分からない。
  const [setup, setSetup] = useState<string | null>(null);
  const [syncKey, setSyncKey] = useState("");
  const [imported, setImported] = useState(false);

  const [scanning, setScanning] = useState(false);

  // 読んだ文字（ファイルの中身、QR の中身）を、同期の設定として受け取る。
  const take = useAsyncAction(async (readText: () => Promise<string | null>) => {
    setImported(false);
    setSetup(null);
    const text = await readText();
    if (text === null) {
      throw new UserFacingError(translate("syncSetup.qrCodeNotFound"));
    }
    if (!isSyncSetup(text)) {
      throw new UserFacingError(translate("syncSetup.notSyncSetup"));
    }
    setSetup(text);
  });
  const readPicked = (isQrCode: boolean) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを選び直しても、もう一度読めるようにする。
    event.target.value = "";
    if (file) {
      void take.run(() => (isQrCode ? readQrCodeFromImage(file) : file.text()));
    }
  };
  const importSetup = useAsyncAction(async () => {
    if (setup === null) {
      return;
    }
    const remoteConfig = await openSyncSetup(setup, syncKey);
    await form.applySyncSetup({ remoteConfig, syncKey });
    setImported(true);
    setSetup(null);
    setSyncKey("");
  });
  const message = take.errorMessage ?? importSetup.errorMessage;
  return (
    <div className="sync-setup-import">
      <span className="hint">{translate("syncSetup.importHint")}</span>
      <div className="sync-setup-import-buttons">
        <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()}><Upload size={15} />{translate("syncSetup.pickFile")}</button>
        {canUseCamera() && (
          <button type="button" className="secondary-button" onClick={() => setScanning(true)}><Camera size={15} />{translate("syncSetup.scanQrCode")}</button>
        )}
        <button type="button" className="secondary-button" onClick={() => qrCodeInput.current?.click()}><QrCode size={15} />{translate("syncSetup.pickQrCodeImage")}</button>
        <input ref={fileInput} type="file" accept={`.${SYNC_SETUP_FILE_EXTENSION},application/json`} hidden aria-label={translate("syncSetup.pickFile")} onChange={readPicked(false)} />
        {/* カメラを使えないとき（許可しなかった、カメラの無い PC）のために、QR の写った画像からも読めるようにする。 */}
        <input ref={qrCodeInput} type="file" accept="image/*" hidden aria-label={translate("syncSetup.pickQrCodeImage")} onChange={readPicked(true)} />
      </div>
      {setup !== null && (
        <div className="field">
          <p className="form-notice" role="status">{translate("syncSetup.loaded")}</p>
          <label htmlFor="sync-setup-key">{translate("syncTarget.syncKey")}</label>
          <input id="sync-setup-key" type="password" value={syncKey} onChange={(event) => setSyncKey(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
          <div className="form-actions">
            {importSetup.busy && <span className="hint">{translate("syncTarget.checking")}</span>}
            <button type="button" className="secondary-button" disabled={importSetup.busy || syncKey === ""} onClick={() => void importSetup.run(undefined)}>{translate("syncSetup.import")}</button>
          </div>
        </div>
      )}
      {scanning && (
        <QrCodeScannerDialog onClose={() => setScanning(false)} onRead={(text) => {
          setScanning(false);
          void take.run(() => Promise.resolve(text));
        }} />
      )}
      {imported && <p className="form-success" role="status">{translate("syncSetup.imported")}</p>}
      {message && <div className="form-error" role="alert">{message}</div>}
    </div>
  );
}
